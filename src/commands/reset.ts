import { spawnSync } from "child_process";
import { rename, unlink } from "fs/promises";
import { join } from "path";

import { workerCompletedDir, workerTaskPath } from "../lib/paths.ts";
import { isProcessRunning, readTask } from "../lib/task.ts";
import { workerLabel } from "./dispatch.ts";

export async function reset(id: string, options?: { force?: boolean }): Promise<void> {
  const task = await readTask(id);

  if (!task) {
    console.log(`Worker ${id} has no task (already idle)`);
    return;
  }

  // Don't reset a running worker unless forced
  if (task.pid && isProcessRunning(task.pid)) {
    if (!options?.force) {
      console.error(`Error: worker ${id} is still running (PID ${task.pid})`);
      console.error(`Use 'stop' to stop it first, or 'reset --force' to kill and reset`);
      process.exit(1);
    }

    // Force kill
    console.log(`Killing worker ${id} (PID ${task.pid})`);
    try {
      process.kill(task.pid, "SIGKILL");
    } catch {
      // Process may have exited between check and kill
    }
  }

  console.log(`Resetting worker ${id}`);
  console.log(`  Repo: ${task.repo}`);
  if (task.issue) {
    console.log(`  Issue: #${task.issue}`);
  }

  // Archive to completed/ with timestamp
  const taskPath = workerTaskPath(id);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveName = `${task.repo.replace("/", "-")}-${task.issue ?? "no-issue"}-${timestamp}.json`;
  const archivePath = join(workerCompletedDir(id), archiveName);

  try {
    await rename(taskPath, archivePath);
    console.log(`  Archived to: ${archivePath}`);
  }
  catch {
    // If rename fails (cross-device?), just delete
    await unlink(taskPath);
    console.log(`  Removed task.json`);
  }

  // Remove worker label from issue if one was assigned
  if (task.issue) {
    const label = workerLabel(id);
    const result = spawnSync(
      "gh",
      ["issue", "edit", String(task.issue), "--repo", task.repo, "--remove-label", label],
      { encoding: "utf-8" }
    );
    if (result.status === 0) {
      console.log(`  Removed label: ${label}`);
    }
  }

  console.log(`Worker ${id} is now idle`);
}
