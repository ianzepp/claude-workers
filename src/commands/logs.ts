import { readFile } from "fs/promises";
import { join } from "path";
import { workerHome } from "../lib/paths.ts";

export async function logs(id: string): Promise<void> {
  const home = workerHome(id);
  const logPath = join(home, "worker.log");

  try {
    const content = await readFile(logPath, "utf-8");
    console.log(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`No log file found for worker ${id}`);
      process.exit(1);
    }
    throw error;
  }
}
