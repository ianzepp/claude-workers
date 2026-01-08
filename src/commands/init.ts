import { mkdir, readFile, writeFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { workerHome, workerClaudeDir, workerCompletedDir } from "../lib/paths.ts";
import { copyCredentials } from "./refresh.ts";

// Built binary is at bin/claude-workers, so go up twice to reach project root
const TEMPLATE_DIR = join(dirname(dirname(import.meta.path)), "templates", "worker");

export async function init(id: string): Promise<void> {
  const home = workerHome(id);
  const claudeDir = workerClaudeDir(id);
  const completedDir = workerCompletedDir(id);
  const githubDir = join(home, "github");

  // Check if worker already exists
  try {
    await readdir(home);
    console.error(`Error: worker ${id} already exists at ${home}`);
    process.exit(1);
  }
  catch {
    // Expected - directory doesn't exist
  }

  console.log(`Creating worker ${id} at ${home}`);

  // Create directory structure
  await mkdir(claudeDir, { recursive: true });
  await mkdir(completedDir, { recursive: true });
  await mkdir(githubDir, { recursive: true });

  // Copy and process template files
  const claudeMdTemplate = await readFile(join(TEMPLATE_DIR, ".claude", "CLAUDE.md"), "utf-8");
  const claudeMd = claudeMdTemplate.replace(/\{\{WORKER_ID\}\}/g, id);
  await writeFile(join(claudeDir, "CLAUDE.md"), claudeMd);

  const settingsJson = await readFile(join(TEMPLATE_DIR, ".claude", "settings.json"), "utf-8");
  await writeFile(join(claudeDir, "settings.json"), settingsJson);

  // Process .zshenv template
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    console.warn("  Warning: GH_TOKEN not set in environment — worker won't have gh access");
  }
  const zshenvTemplate = await readFile(join(TEMPLATE_DIR, ".zshenv"), "utf-8");
  const zshenv = zshenvTemplate.replace(/\{\{GH_TOKEN\}\}/g, ghToken ?? "");
  await writeFile(join(home, ".zshenv"), zshenv);
  console.log("  Created .zshenv");

  // Copy credentials from real home
  await copyCredentials(id);

  console.log(`Worker ${id} initialized`);
  console.log(`  Home: ${home}`);
  console.log(`  Branch prefix: w${id}/`);
}
