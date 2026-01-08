import { spawnSync } from "child_process";
import { getWorkerStatus } from "../lib/task.ts";
import { dispatch } from "./dispatch.ts";
import { getWorkerIds } from "../lib/paths.ts";

interface Issue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  repository: { nameWithOwner: string };
}

function getUnassignedIssues(): Issue[] {
  // Search for open issues in user's repos
  const result = spawnSync("gh", [
    "search", "issues",
    "--state", "open",
    "--owner", "@me",
    "--json", "number,title,labels,repository",
  ], { encoding: "utf-8" });

  if (result.status !== 0) {
    console.error("Error querying issues:", result.stderr);
    return [];
  }

  try {
    const issues = JSON.parse(result.stdout) as Issue[];

    // Filter out issues that have worker:* labels or pull-request label
    return issues.filter(issue => {
      const labelNames = issue.labels.map(l => l.name);
      const hasWorkerLabel = labelNames.some(l => l.startsWith("worker:"));
      const hasPRLabel = labelNames.includes("pull-request");
      const hasBlockedLabel = labelNames.includes("blocked");
      return !hasWorkerLabel && !hasPRLabel && !hasBlockedLabel;
    });
  }
  catch {
    return [];
  }
}

async function findIdleWorker(): Promise<string | null> {
  const ids = await getWorkerIds();

  // Skip vilicus and dispensator - they're special agents
  const workerIds = ids.filter(id => id !== "vilicus" && id !== "dispensator");

  for (const id of workerIds) {
    const { status } = await getWorkerStatus(id);
    if (status === "idle") {
      return id;
    }
  }

  return null;
}

export async function assign(): Promise<void> {
  // Find unassigned issues
  const issues = getUnassignedIssues();

  if (issues.length === 0) {
    console.log("No unassigned issues found");
    return;
  }

  console.log(`${issues.length} unassigned issue(s) found`);

  // Find an idle worker
  const workerId = await findIdleWorker();

  if (!workerId) {
    console.log("No idle workers available");
    return;
  }

  // Dispatch the first issue to the worker
  const issue = issues[0];
  const repo = issue.repository.nameWithOwner;

  console.log(`Assigning to worker ${workerId}:`);
  console.log(`  ${repo}#${issue.number}: ${issue.title}`);

  await dispatch(workerId, repo, issue.number);
}
