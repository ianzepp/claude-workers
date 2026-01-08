import { readdir, realpath } from "fs/promises";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { WORKERS_ROOT } from "../lib/paths.ts";
import { refresh } from "./refresh.ts";

async function getRepoRoot(): Promise<string> {
  // Follow symlink to find actual binary location, then go up from bin/
  const realBinaryPath = await realpath(process.argv[1]);
  return dirname(dirname(realBinaryPath));
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

export async function update(): Promise<void> {
  const repoRoot = await getRepoRoot();
  console.log(`Updating claude-workers from git...\n`);

  // Git pull
  console.log("  git pull");
  const pullResult = spawnSync("git", ["pull"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (pullResult.status !== 0) {
    console.error("Error: git pull failed");
    process.exit(1);
  }

  // Rebuild
  console.log("\n  bun run build");
  const buildResult = spawnSync("bun", ["run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (buildResult.status !== 0) {
    console.error("Error: build failed");
    process.exit(1);
  }

  // Refresh all workers
  const workers = await listWorkers();

  if (workers.length === 0) {
    console.log("\nNo workers to refresh");
    return;
  }

  console.log(`\nRefreshing ${workers.length} worker(s)...\n`);

  for (const id of workers) {
    await refresh(id);
    console.log();
  }

  console.log("Update complete");
}
