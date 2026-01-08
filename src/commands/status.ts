import { readdir } from "fs/promises";
import { spawnSync } from "child_process";
import { WORKERS_ROOT, workerHome } from "../lib/paths.ts";
import { getWorkerStatus, type WorkerStatus } from "../lib/task.ts";
import { workerLabel } from "./dispatch.ts";

interface WorkerInfo {
  id: string;
  status: WorkerStatus;
  repo?: string;
  issue?: number;
  pid?: number;
  startedAt?: string;
}

interface LabeledIssue {
  repo: string;
  number: number;
  title: string;
  workerId: string;
}

function queryLabeledIssues(workerId: string): LabeledIssue[] {
  const label = workerLabel(workerId);
  // Search all repos the user has access to
  const result = spawnSync("gh", [
    "search", "issues",
    "--label", label,
    "--state", "open",
    "--json", "repository,number,title",
  ], { encoding: "utf-8" });

  if (result.status !== 0) {
    return [];
  }

  try {
    const issues = JSON.parse(result.stdout) as Array<{
      repository: { nameWithOwner: string };
      number: number;
      title: string;
    }>;
    return issues.map((i) => ({
      repo: i.repository.nameWithOwner,
      number: i.number,
      title: i.title,
      workerId,
    }));
  }
  catch {
    return [];
  }
}

async function getWorkerInfo(id: string): Promise<WorkerInfo> {
  const { status, task } = await getWorkerStatus(id);
  return {
    id,
    status,
    repo: task?.repo,
    issue: task?.issue,
    pid: task?.pid,
    startedAt: task?.startedAt,
  };
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

function formatStatus(info: WorkerInfo): string {
  const statusColors: Record<WorkerStatus, string> = {
    idle: "\x1b[32m", // green
    busy: "\x1b[33m", // yellow
    crashed: "\x1b[31m", // red
  };
  const reset = "\x1b[0m";
  const color = statusColors[info.status];

  let line = `${info.id}: ${color}${info.status}${reset}`;

  if (info.repo) {
    line += ` - ${info.repo}#${info.issue}`;
  }
  if (info.pid) {
    line += ` (PID ${info.pid})`;
  }
  if (info.startedAt) {
    const started = new Date(info.startedAt);
    const elapsed = Math.floor((Date.now() - started.getTime()) / 1000 / 60);
    line += ` [${elapsed}m]`;
  }

  return line;
}

export async function status(id?: string): Promise<void> {
  if (id) {
    // Single worker status
    try {
      await readdir(workerHome(id));
    }
    catch {
      console.error(`Error: worker ${id} does not exist`);
      process.exit(1);
    }

    const info = await getWorkerInfo(id);
    console.log(formatStatus(info));

    if (info.status === "crashed" && info.repo) {
      console.log(`  Recoverable: dispatch again or check ${workerHome(id)}`);
    }

    // Check for orphaned issues (labeled but worker not working on them)
    const labeledIssues = queryLabeledIssues(id);
    const orphaned = labeledIssues.filter((li) =>
      info.status === "idle" || (li.repo !== info.repo || li.number !== info.issue)
    );

    if (orphaned.length > 0) {
      console.log(`\n  Orphaned issues (labeled but not being worked):`);
      for (const issue of orphaned) {
        console.log(`    ${issue.repo}#${issue.number}: ${issue.title}`);
      }
    }
  }
  else {
    // All workers
    const workers = await listWorkers();

    if (workers.length === 0) {
      console.log(`No workers found in ${WORKERS_ROOT}`);
      console.log(`Create one with: claude-workers init <id>`);
      return;
    }

    console.log(`Workers (${WORKERS_ROOT}):\n`);

    const orphanedAll: LabeledIssue[] = [];

    for (const workerId of workers) {
      const info = await getWorkerInfo(workerId);
      console.log("  " + formatStatus(info));

      // Check for orphaned issues
      const labeledIssues = queryLabeledIssues(workerId);
      const orphaned = labeledIssues.filter((li) =>
        info.status === "idle" || (li.repo !== info.repo || li.number !== info.issue)
      );
      orphanedAll.push(...orphaned);
    }

    if (orphanedAll.length > 0) {
      console.log(`\nOrphaned issues (labeled but worker idle/crashed):`);
      for (const issue of orphanedAll) {
        console.log(`  ${issue.repo}#${issue.number} (${workerLabel(issue.workerId)}): ${issue.title}`);
      }
    }
  }
}
