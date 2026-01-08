import { homedir } from "os";
import { join } from "path";
import { readdir } from "fs/promises";

export const WORKERS_ROOT = join(homedir(), "workers");

export async function getWorkerIds(): Promise<string[]> {
  try {
    const entries = await readdir(WORKERS_ROOT, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  }
  catch {
    return [];
  }
}

export function workerHome(id: string): string {
  return join(WORKERS_ROOT, id);
}

export function workerTaskPath(id: string): string {
  return join(workerHome(id), "task.json");
}

export function workerCompletedDir(id: string): string {
  return join(workerHome(id), "completed");
}

export function workerClaudeDir(id: string): string {
  return join(workerHome(id), ".claude");
}
