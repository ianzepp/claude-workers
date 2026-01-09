import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

import { getTemplateDir, workerClaudeDir, workerCompletedDir, workerHome } from "../lib/paths.ts";
import { copyCredentials } from "./refresh.ts";

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
  } catch {
    // Expected - directory doesn't exist
  }

  console.log(`Creating worker ${id} at ${home}`);

  // Create directory structure
  await mkdir(claudeDir, { recursive: true });
  await mkdir(completedDir, { recursive: true });
  await mkdir(githubDir, { recursive: true });

  // Copy and process template files
  const templateDir = getTemplateDir(id);
  const claudeMdTemplate = await readFile(join(templateDir, ".claude", "CLAUDE.md"), "utf-8");
  const claudeMd = claudeMdTemplate.replace(/\{\{WORKER_ID\}\}/g, id);
  await writeFile(join(claudeDir, "CLAUDE.md"), claudeMd);

  const settingsJson = await readFile(join(templateDir, ".claude", "settings.json"), "utf-8");
  await writeFile(join(claudeDir, "settings.json"), settingsJson);

  // Process .zshenv template
  const ghToken = process.env.GH_TOKEN;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!ghToken) {
    console.warn("  Warning: GH_TOKEN not set in environment — worker won't have gh access");
  }
  if (!oauthToken) {
    console.warn(
      "  Warning: CLAUDE_CODE_OAUTH_TOKEN not set in environment — worker won't have Claude access"
    );
  }
  const zshenvTemplate = await readFile(join(templateDir, ".zshenv"), "utf-8");
  const zshenv = zshenvTemplate
    .replace(/\{\{GH_TOKEN\}\}/g, ghToken ?? "")
    .replace(/\{\{CLAUDE_CODE_OAUTH_TOKEN\}\}/g, oauthToken ?? "");
  await writeFile(join(home, ".zshenv"), zshenv);
  console.log("  Created .zshenv");

  // Copy credentials from real home
  await copyCredentials(id);

  console.log(`Worker ${id} initialized`);
  console.log(`  Home: ${home}`);
}
