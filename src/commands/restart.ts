import { spawn } from "child_process";
import { open } from "fs/promises";
import { join } from "path";
import { workerHome } from "../lib/paths.ts";
import { readTask, writeTask, isProcessRunning } from "../lib/task.ts";

export async function restart(id: string): Promise<void> {
  const home = workerHome(id);

  // Check for existing task
  const task = await readTask(id);
  if (!task) {
    console.error(`Error: worker ${id} has no task to restart`);
    process.exit(1);
  }

  // Check if already running
  if (task.pid && isProcessRunning(task.pid)) {
    console.error(`Error: worker ${id} is already running (PID ${task.pid})`);
    process.exit(1);
  }

  console.log(`Restarting worker ${id}`);
  console.log(`  Repo: ${task.repo}`);
  if (task.issue) {
    console.log(`  Issue: #${task.issue}`);
  }
  if (task.prompt) {
    console.log(
      `  Prompt: ${task.prompt.length > 60 ? task.prompt.slice(0, 60) + "..." : task.prompt}`
    );
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

  // Update task.json with new PID (preserve other fields)
  await writeTask(id, {
    ...task,
    pid: child.pid,
  });

  console.log(`  Spawned PID: ${child.pid}`);
  console.log(`  Log: ${logPath}`);
  console.log(`Worker ${id} restarted. Check progress with: claude-workers status ${id}`);
}
