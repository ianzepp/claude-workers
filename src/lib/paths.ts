import { homedir } from "os";
import { join } from "path";

export const WORKERS_ROOT = join(homedir(), "workers");

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
