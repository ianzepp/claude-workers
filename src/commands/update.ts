import { spawnSync } from "child_process";
import { realpath } from "fs/promises";
import { dirname } from "path";

import { getWorkerIds } from "../lib/paths.ts";
import { refresh } from "./refresh.ts";

async function getRepoRoot(): Promise<string> {
  // Follow symlink to find actual binary location, then go up from bin/
  const realBinaryPath = await realpath(process.argv[1]);
  return dirname(dirname(realBinaryPath));
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
  const workers = await getWorkerIds();

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
