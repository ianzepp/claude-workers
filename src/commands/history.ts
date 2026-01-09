import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

import { getWorkerIds, workerCompletedDir } from "../lib/paths.ts";
import type { Task } from "../lib/task.ts";

interface CompletedTask extends Task {
  workerId: string;
  completedAt: Date;
}

async function getCompletedTasks(workerId: string): Promise<CompletedTask[]> {
  const dir = workerCompletedDir(workerId);
  const tasks: CompletedTask[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const path = join(dir, file);
      try {
        const content = await readFile(path, "utf-8");
        const task = JSON.parse(content) as Task;
        const fileStat = await stat(path);

        tasks.push({
          ...task,
          workerId,
          completedAt: fileStat.mtime,
        });
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // No completed directory
  }

  return tasks;
}

function formatTask(task: CompletedTask): string {
  const date = task.completedAt.toISOString().split("T")[0];
  const time = task.completedAt.toTimeString().split(" ")[0].slice(0, 5);
  return `  ${date} ${time}  ${task.repo}#${task.issue}  (w${task.workerId})`;
}

export async function history(id?: string): Promise<void> {
  const workerIds = id ? [id] : await getWorkerIds();
  const allTasks: CompletedTask[] = [];

  for (const workerId of workerIds) {
    const tasks = await getCompletedTasks(workerId);
    allTasks.push(...tasks);
  }

  if (allTasks.length === 0) {
    console.log("No completed tasks");
    return;
  }

  // Sort by completion time, newest first
  allTasks.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  console.log("Completed tasks:\n");
  for (const task of allTasks) {
    console.log(formatTask(task));
  }
}
