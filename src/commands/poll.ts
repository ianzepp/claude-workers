import { spawnSync } from "child_process";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { getWorkerStatus } from "../lib/task.ts";
import { dispatch } from "./dispatch.ts";

const CACHE_DIR = join(homedir(), ".cache", "claude-workers");
const REVIEWED_CACHE = join(CACHE_DIR, "reviewed.json");

interface PullRequest {
  number: number;
  repository: { nameWithOwner: string };
  title: string;
}

interface ReviewedCache {
  [prKey: string]: {
    reviewedAt: string;
    outcome?: string;
  };
}

async function loadCache(): Promise<ReviewedCache> {
  try {
    const content = await readFile(REVIEWED_CACHE, "utf-8");
    return JSON.parse(content);
  }
  catch {
    return {};
  }
}

async function saveCache(cache: ReviewedCache): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(REVIEWED_CACHE, JSON.stringify(cache, null, 2) + "\n");
}

function getPendingPRs(): PullRequest[] {
  // Search for open PRs with pull-request label
  const result = spawnSync("gh", [
    "search", "prs",
    "--label", "pull-request",
    "--state", "open",
    "--json", "number,repository,title",
  ], { encoding: "utf-8" });

  if (result.status !== 0) {
    console.error("Error querying PRs:", result.stderr);
    return [];
  }

  try {
    return JSON.parse(result.stdout) as PullRequest[];
  }
  catch {
    return [];
  }
}

export async function poll(): Promise<void> {
  // Check if vilicus exists and is idle
  const { status } = await getWorkerStatus("vilicus");

  if (status === "busy") {
    console.log("vilicus is busy, skipping poll");
    return;
  }

  if (status === "crashed") {
    console.log("vilicus has crashed task, skipping poll");
    return;
  }

  // Get pending PRs
  const prs = getPendingPRs();

  if (prs.length === 0) {
    console.log("No PRs pending review");
    return;
  }

  // Load review cache
  const cache = await loadCache();

  // Find PRs not yet reviewed
  const unreviewedPRs = prs.filter((pr) => {
    const key = `${pr.repository.nameWithOwner}#${pr.number}`;
    return !cache[key];
  });

  if (unreviewedPRs.length === 0) {
    console.log(`${prs.length} PR(s) found, all already reviewed`);
    return;
  }

  console.log(`${unreviewedPRs.length} PR(s) pending review`);

  // Review the first unreviewed PR
  const pr = unreviewedPRs[0];
  const repo = pr.repository.nameWithOwner;
  const prKey = `${repo}#${pr.number}`;

  console.log(`Dispatching vilicus to review: ${prKey}`);
  console.log(`  Title: ${pr.title}`);

  // Mark as being reviewed (to prevent double-dispatch)
  cache[prKey] = { reviewedAt: new Date().toISOString() };
  await saveCache(cache);

  // Dispatch vilicus - use PR number as "issue" field
  await dispatch("vilicus", repo, pr.number, `Review PR #${pr.number}: ${pr.title}`);
}
