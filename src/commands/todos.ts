import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { WORKERS_ROOT, workerHome } from "../lib/paths.ts";
import { getWorkerStatus } from "../lib/task.ts";

interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

async function getLatestTodos(workerId: string): Promise<Todo[]> {
  const todosDir = join(workerHome(workerId), ".claude", "todos");

  try {
    const files = await readdir(todosDir);
    if (files.length === 0) return [];

    // Get file stats and sort by mtime descending
    const fileStats = await Promise.all(
      files.map(async (f) => {
        const path = join(todosDir, f);
        const stat = await Bun.file(path).stat();
        return { name: f, mtime: stat?.mtime?.getTime() ?? 0, path };
      })
    );

    fileStats.sort((a, b) => b.mtime - a.mtime);
    const latest = fileStats[0];

    const content = await readFile(latest.path, "utf-8");
    const todos = JSON.parse(content) as Todo[];

    // Filter out empty arrays
    if (!Array.isArray(todos) || todos.length === 0) return [];

    return todos;
  }
  catch {
    return [];
  }
}

async function listWorkers(): Promise<string[]> {
  try {
    const entries = await readdir(WORKERS_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }
  catch {
    return [];
  }
}

export async function todos(id?: string): Promise<void> {
  const workerIds = id ? [id] : await listWorkers();

  if (workerIds.length === 0) {
    console.log("No workers found");
    return;
  }

  for (const workerId of workerIds) {
    const { status, task } = await getWorkerStatus(workerId);
    const todos = await getLatestTodos(workerId);

    const statusColors: Record<string, string> = {
      idle: "\x1b[32m",
      busy: "\x1b[33m",
      crashed: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    const dim = "\x1b[2m";
    const color = statusColors[status] ?? "";

    let header = `Worker ${workerId}: ${color}${status}${reset}`;
    if (task) {
      header += ` - ${task.repo}#${task.issue}`;
    }
    console.log(header);

    if (todos.length === 0) {
      console.log(`  ${dim}(no todos)${reset}`);
    }
    else {
      for (const todo of todos) {
        const icon = todo.status === "completed" ? "✓" :
                     todo.status === "in_progress" ? "→" : "○";
        const todoColor = todo.status === "completed" ? dim :
                          todo.status === "in_progress" ? "\x1b[36m" : "";
        console.log(`  ${todoColor}${icon} ${todo.content}${reset}`);
      }
    }
    console.log();
  }
}
