import { spawn, spawnSync } from "child_process";
import { open, readdir } from "fs/promises";
import { join } from "path";

import { getWorkerIds, workerHome } from "../lib/paths.ts";
import { getWorkerStatus, isProcessRunning, readTask, writeTask } from "../lib/task.ts";

export function workerLabel(id: string): string {
  return `worker:${id}`;
}

export async function findIdleWorker(): Promise<string | null> {
  const ids = await getWorkerIds();
  const workerIds = ids.filter((id) => id !== "vilicus" && id !== "dispensator");

  for (const id of workerIds) {
    const { status } = await getWorkerStatus(id);
    if (status === "idle") {
      return id;
    }
  }

  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString().trim();
}

export async function dispatch(
  id: string,
  repo: string,
  issue?: number,
  prompt?: string,
  options?: { silent?: boolean; skipStdin?: boolean }
): Promise<boolean> {
  const home = workerHome(id);

  // Verify worker exists
  try {
    await readdir(home);
  } catch {
    if (!options?.silent) {
      console.error(`Error: worker ${id} does not exist`);
      console.error(`Run: claude-workers init ${id}`);
    }
    return false;
  }

  // Check if worker is busy
  const existingTask = await readTask(id);
  if (existingTask) {
    if (existingTask.pid && isProcessRunning(existingTask.pid)) {
      if (!options?.silent) {
        console.error(`Error: worker ${id} is busy`);
        console.error(`  Repo: ${existingTask.repo}`);
        if (existingTask.issue) console.error(`  Issue: ${existingTask.issue}`);
        console.error(`  PID: ${existingTask.pid}`);
      }
      return false;
    }
    // Stale task - warn but proceed
    if (!options?.silent) {
      console.warn(`Warning: worker ${id} has stale task from crashed run`);
      console.warn(
        `  Previous: ${existingTask.repo}${existingTask.issue ? "#" + existingTask.issue : ""}`
      );
      console.warn(`  Overwriting with new assignment`);
    }
  }

  // Read prompt from stdin if not provided
  let taskPrompt = prompt;
  if (!taskPrompt && !options?.skipStdin && !process.stdin.isTTY) {
    taskPrompt = await readStdin();
    if (!taskPrompt) taskPrompt = undefined;
  }

  console.log(`Dispatching worker ${id}`);
  console.log(`  Repo: ${repo}`);
  if (issue) {
    console.log(`  Issue: #${issue}`);
  }
  if (taskPrompt) {
    console.log(
      `  Prompt: ${taskPrompt.length > 60 ? taskPrompt.slice(0, 60) + "..." : taskPrompt}`
    );
  }

  // Add labels only if there's an issue
  if (issue) {
    const label = workerLabel(id);
    spawnSync("gh", ["label", "create", label, "--repo", repo, "--color", "0E8A16", "--force"], {
      encoding: "utf-8",
    });
    spawnSync(
      "gh",
      ["label", "create", "pull-request", "--repo", repo, "--color", "1D76DB", "--force"],
      {
        encoding: "utf-8",
      }
    );
    const labelResult = spawnSync(
      "gh",
      ["issue", "edit", String(issue), "--repo", repo, "--add-label", label],
      {
        encoding: "utf-8",
      }
    );
    if (labelResult.status !== 0) {
      console.warn(
        `  Warning: failed to add label: ${labelResult.stderr?.trim() || "unknown error"}`
      );
    } else {
      console.log(`  Added label: ${label}`);
    }
  }

  // Spawn claude in background with worker's HOME
  const logPath = join(home, "worker.log");
  const logFile = await open(logPath, "w");
  const startPrompt =
    "Read ~/task.json and execute the task following your CLAUDE.md instructions.";
  const child = spawn("claude", ["--print", "--dangerously-skip-permissions", startPrompt], {
    cwd: home,
    env: {
      ...process.env,
      HOME: home,
    },
    detached: true,
    stdio: ["ignore", logFile.fd, logFile.fd],
  });

  child.unref();

  // Close parent's file descriptor so we don't block on it
  await logFile.close();

  // Write task.json ONCE, with PID, AFTER spawning
  // WHY: Writing before spawning creates a race window where another assign
  // sees a task.json with no PID and treats it as stale
  await writeTask(id, {
    repo,
    issue,
    prompt: taskPrompt,
    pid: child.pid,
    startedAt: new Date().toISOString(),
  });

  console.log(`  Spawned PID: ${child.pid}`);
  console.log(`  Log: ${logPath}`);
  console.log(`Worker ${id} dispatched. Check task progress with: claude-workers status ${id}`);

  return true;
}
