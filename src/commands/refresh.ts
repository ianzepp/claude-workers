import { cp, rm, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { workerHome } from "../lib/paths.ts";

const TEMPLATE_DIR = join(dirname(dirname(import.meta.path)), "templates", "worker");

const CREDENTIALS = [
  ".gitconfig",
  ".ssh",
  ".gh",
];

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
    }
    catch (err) {
      console.warn(`  Warning: could not copy ${name}: ${err}`);
    }
  }
}

async function refreshZshenv(id: string): Promise<void> {
  const home = workerHome(id);
  const ghToken = process.env.GH_TOKEN;

  if (!ghToken) {
    console.warn("  Warning: GH_TOKEN not set in environment");
  }

  const zshenvTemplate = await readFile(join(TEMPLATE_DIR, ".zshenv"), "utf-8");
  const zshenv = zshenvTemplate.replace(/\{\{GH_TOKEN\}\}/g, ghToken ?? "");
  await writeFile(join(home, ".zshenv"), zshenv);
  console.log("  Refreshed .zshenv");
}

async function refreshClaudeMd(id: string): Promise<void> {
  const home = workerHome(id);
  const claudeDir = join(home, ".claude");

  const claudeMdTemplate = await readFile(join(TEMPLATE_DIR, ".claude", "CLAUDE.md"), "utf-8");
  const claudeMd = claudeMdTemplate.replace(/\{\{WORKER_ID\}\}/g, id);
  await writeFile(join(claudeDir, "CLAUDE.md"), claudeMd);
  console.log("  Refreshed CLAUDE.md");

  const settingsJson = await readFile(join(TEMPLATE_DIR, ".claude", "settings.json"), "utf-8");
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
