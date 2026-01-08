import { getWorkerStatus } from "../lib/task.ts";

const POLL_INTERVAL_MS = 5000;

export async function watch(id: string): Promise<void> {
  console.log(`Watching worker ${id}...`);

  while (true) {
    const { status, task } = await getWorkerStatus(id);

    if (status === "idle") {
      console.log(`Worker ${id} finished (idle)`);
      if (task) {
        console.log(`  Repo: ${task.repo}`);
        console.log(`  Issue: #${task.issue}`);
      }
      process.exit(0);
    }

    if (status === "crashed") {
      console.log(`Worker ${id} crashed`);
      if (task) {
        console.log(`  Repo: ${task.repo}`);
        console.log(`  Issue: #${task.issue}`);
        if (task.error) {
          console.log(`  Error: ${task.error}`);
        }
      }
      process.exit(1);
    }

    // Still busy, wait and poll again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
