import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";

export const WORKERS_ROOT = join(homedir(), "workers");

// Built binary is at bin/claude-workers, so go up twice to reach project root
export const TEMPLATES_ROOT = join(dirname(dirname(import.meta.path)), "templates");

export async function getWorkerIds(): Promise<string[]> {
  try {
    const entries = await readdir(WORKERS_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
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

export function getTemplateDir(id: string): string {
  // Use worker-specific template if it exists (e.g., templates/vilicus), otherwise default
  const specialTemplate = join(TEMPLATES_ROOT, id);
  if (existsSync(specialTemplate)) {
    return specialTemplate;
  }
  return join(TEMPLATES_ROOT, "worker");
}
