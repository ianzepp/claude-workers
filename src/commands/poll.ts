import { spawnSync } from "child_process";
import { getWorkerStatus } from "../lib/task.ts";
import { dispatch } from "./dispatch.ts";

interface PullRequest {
  number: number;
  repository: { nameWithOwner: string };
  title: string;
}

function getPendingPRs(): PullRequest[] {
  // Search for open PRs with pull-request label in user's repos
  const result = spawnSync("gh", [
    "search", "prs",
    "--label", "pull-request",
    "--state", "open",
    "--owner", "@me",
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

  // Get pending PRs (those with pull-request label)
  const prs = getPendingPRs();

  if (prs.length === 0) {
    console.log("No PRs pending review");
    return;
  }

  // Review the first pending PR
  const pr = prs[0];
  const repo = pr.repository.nameWithOwner;
  const prKey = `${repo}#${pr.number}`;

  console.log(`${prs.length} PR(s) pending review`);
  console.log(`Dispatching vilicus to review: ${prKey}`);
  console.log(`  Title: ${pr.title}`);

  // Dispatch vilicus - use PR number as "issue" field
  await dispatch("vilicus", repo, pr.number, `Review PR #${pr.number}: ${pr.title}`, { skipStdin: true });
}
