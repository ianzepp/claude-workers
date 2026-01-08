import { readFile, writeFile } from "fs/promises";
import { workerTaskPath } from "./paths.ts";

export interface Task {
  repo: string;
  issue: number;
  prompt?: string;
  pid?: number;
  startedAt?: string;
  error?: string;
}

export async function readTask(workerId: string): Promise<Task | null> {
  const path = workerTaskPath(workerId);
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as Task;
  }
  catch {
    return null;
  }
}

export async function writeTask(workerId: string, task: Task): Promise<void> {
  const path = workerTaskPath(workerId);
  await writeFile(path, JSON.stringify(task, null, 2) + "\n");
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  }
  catch {
    return false;
  }
}

export type WorkerStatus = "idle" | "busy" | "crashed";

export async function getWorkerStatus(workerId: string): Promise<{ status: WorkerStatus; task: Task | null }> {
  const task = await readTask(workerId);

  if (!task) {
    return { status: "idle", task: null };
  }

  if (task.pid && isProcessRunning(task.pid)) {
    return { status: "busy", task };
  }

  return { status: "crashed", task };
}
