import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { cp, readFile, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import { getTemplateDir, workerHome } from "../lib/paths.ts";

const CREDENTIALS = [".gitconfig", ".ssh", ".gh"];

export async function copyCredentials(id: string): Promise<void> {
  const home = workerHome(id);
  const realHome = homedir();

  for (const name of CREDENTIALS) {
    const src = join(realHome, name);
    const dst = join(home, name);

    if (!existsSync(src)) {
      console.log(`  Skipped ${name} (not found)`);
      continue;
    }

    // Remove existing copy if present
    if (existsSync(dst)) {
      await rm(dst, { recursive: true, force: true });
    }

    try {
      await cp(src, dst, { recursive: true });
      console.log(`  Copied ${name}`);
    } catch (err) {
      console.warn(`  Warning: could not copy ${name}: ${err}`);
    }
  }

  // Configure git to use gh as credential helper
  const result = spawnSync("gh", ["auth", "setup-git"], {
    env: { ...process.env, HOME: home },
    encoding: "utf-8",
  });
  if (result.status === 0) {
    console.log("  Configured git credential helper for gh");
  } else {
    console.warn(
      `  Warning: could not configure git credential helper: ${result.stderr?.trim() || "unknown error"}`
    );
  }
}

async function refreshZshenv(id: string): Promise<void> {
  const home = workerHome(id);
  const templateDir = getTemplateDir(id);
  const ghToken = process.env.GH_TOKEN;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (!ghToken) {
    console.warn("  Warning: GH_TOKEN not set in environment");
  }
  if (!oauthToken) {
    console.warn("  Warning: CLAUDE_CODE_OAUTH_TOKEN not set in environment");
  }

  const zshenvTemplate = await readFile(join(templateDir, ".zshenv"), "utf-8");
  const zshenv = zshenvTemplate
    .replace(/\{\{GH_TOKEN\}\}/g, ghToken ?? "")
    .replace(/\{\{CLAUDE_CODE_OAUTH_TOKEN\}\}/g, oauthToken ?? "");
  await writeFile(join(home, ".zshenv"), zshenv);
  console.log("  Refreshed .zshenv");
}

async function refreshClaudeMd(id: string): Promise<void> {
  const home = workerHome(id);
  const claudeDir = join(home, ".claude");
  const templateDir = getTemplateDir(id);

  const claudeMdTemplate = await readFile(join(templateDir, ".claude", "CLAUDE.md"), "utf-8");
  const claudeMd = claudeMdTemplate.replace(/\{\{WORKER_ID\}\}/g, id);
  await writeFile(join(claudeDir, "CLAUDE.md"), claudeMd);
  console.log("  Refreshed CLAUDE.md");

  const settingsJson = await readFile(join(templateDir, ".claude", "settings.json"), "utf-8");
  await writeFile(join(claudeDir, "settings.json"), settingsJson);
  console.log("  Refreshed settings.json");
}

export async function refresh(id: string): Promise<void> {
  const home = workerHome(id);

  if (!existsSync(home)) {
    console.error(`Error: worker ${id} does not exist`);
    process.exit(1);
  }

  console.log(`Refreshing worker ${id}`);
  await copyCredentials(id);
  await refreshZshenv(id);
  await refreshClaudeMd(id);
  console.log(`Done`);
}
