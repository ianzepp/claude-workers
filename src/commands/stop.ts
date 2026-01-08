import { readTask, isProcessRunning } from "../lib/task.ts";

export async function stop(id: string): Promise<void> {
  const task = await readTask(id);

  if (!task) {
    console.error(`Error: worker ${id} has no task`);
    process.exit(1);
  }

  if (!task.pid) {
    console.error(`Error: worker ${id} has no PID recorded`);
    process.exit(1);
  }

  if (!isProcessRunning(task.pid)) {
    console.log(`Worker ${id} is not running (PID ${task.pid} not found)`);
    console.log(`Task remains in place — use 'restart' to resume or manually remove task.json`);
    return;
  }

  console.log(`Stopping worker ${id}`);
  console.log(`  Repo: ${task.repo}`);
  if (task.issue) {
    console.log(`  Issue: #${task.issue}`);
  }
  console.log(`  PID: ${task.pid}`);

  try {
    process.kill(task.pid, "SIGTERM");
    console.log(`  Sent SIGTERM`);

    // Give it a moment to terminate gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (isProcessRunning(task.pid)) {
      console.log(`  Still running, sending SIGKILL`);
      process.kill(task.pid, "SIGKILL");
    }

    console.log(`Worker ${id} stopped`);
    console.log(`Task remains in place — use 'restart' to resume or manually remove task.json`);
  }
  catch (err) {
    console.error(`Error killing process: ${err}`);
    process.exit(1);
  }
}
