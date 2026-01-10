#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { dispatch, findIdleWorker } from "./commands/dispatch.ts";
import { restart } from "./commands/restart.ts";
import { reset } from "./commands/reset.ts";
import { stop } from "./commands/stop.ts";
import { status } from "./commands/status.ts";
import { inspect } from "./commands/inspect.ts";
import { logs } from "./commands/logs.ts";
import { refresh } from "./commands/refresh.ts";
import { watch } from "./commands/watch.ts";
import { todos } from "./commands/todos.ts";
import { update } from "./commands/update.ts";
import { history } from "./commands/history.ts";
import { assign } from "./commands/assign.ts";

const USAGE = `
claude-workers - Orchestration for autonomous Claude Code agents

Usage:
  claude-workers init <id>                                    Create worker from template
  claude-workers dispatch -r <repo> [-i issue] [-w worker] [-p prompt] [-m model]
  claude-workers restart <id>                                 Restart crashed worker
  claude-workers reset <id> [--force]                         Clear task and return to idle
  claude-workers stop <id>                                    Stop running worker
  claude-workers status [id]                                  Show worker status
  claude-workers inspect <id> [lines]                         Show recent conversation activity
  claude-workers logs <id>                                    Show full worker log output
  claude-workers todos [id]                                   Show worker todo lists
  claude-workers refresh <id>                                 Re-copy credentials to worker
  claude-workers watch <id>                                   Poll until worker finishes
  claude-workers update                                       Pull latest and refresh all workers
  claude-workers history [id]                                 Show completed tasks
  claude-workers assign                                       Assign open issues to idle workers

Options:
  -m, --model <model>   Model to use: sonnet (default) or opus

Dispatch reads prompt from stdin if not provided as argument (EOF = no prompt).

Examples:
  claude-workers init 01
  claude-workers dispatch -r ianzepp/faber-romanus -i 22
  claude-workers dispatch -r ianzepp/faber-romanus -i 22 -m opus
  claude-workers dispatch -r ianzepp/faber-romanus -i 22 -p "Investigate only"
  claude-workers status
`.trim();

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case "init": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers init <id>");
        process.exit(1);
      }
      await init(id);
      break;
    }

    case "dispatch": {
      // Parse flags
      let repo: string | undefined;
      let issue: number | undefined;
      let workerId: string | undefined;
      let prompt: string | undefined;
      let model: string | undefined;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        if ((arg === "-r" || arg === "--repo") && next) {
          repo = next;
          i++;
        }
        else if ((arg === "-i" || arg === "--issue") && next) {
          issue = parseInt(next, 10);
          i++;
        }
        else if ((arg === "-w" || arg === "--worker") && next) {
          workerId = next;
          i++;
        }
        else if ((arg === "-p" || arg === "--prompt") && next) {
          prompt = next;
          i++;
        }
        else if ((arg === "-m" || arg === "--model") && next) {
          model = next;
          i++;
        }
      }

      if (!repo) {
        console.error("Error: repo required");
        console.error(
          "Usage: claude-workers dispatch -r <repo> [-i issue] [-w worker] [-p prompt] [-m model]"
        );
        process.exit(1);
      }

      // Auto-select worker if not provided
      let id: string;
      if (workerId) {
        id = workerId;
      }
      else {
        const foundId = await findIdleWorker();
        if (!foundId) {
          console.error("Error: no idle workers available");
          process.exit(1);
        }
        id = foundId;
      }

      const success = await dispatch(id, repo, issue, prompt, { model });
      if (!success) {
        process.exit(1);
      }
      break;
    }

    case "restart": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers restart <id>");
        process.exit(1);
      }
      await restart(id);
      break;
    }

    case "reset": {
      const id = args.find((a) => !a.startsWith("-"));
      const force = args.includes("--force") || args.includes("-f");
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers reset <id> [--force]");
        process.exit(1);
      }
      await reset(id, { force });
      break;
    }

    case "stop": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers stop <id>");
        process.exit(1);
      }
      await stop(id);
      break;
    }

    case "status": {
      const [id] = args;
      await status(id);
      break;
    }

    case "inspect": {
      const [id, linesArg] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers inspect <id> [lines]");
        process.exit(1);
      }
      const lines = linesArg ? parseInt(linesArg, 10) : 30;
      await inspect(id, lines);
      break;
    }

    case "logs": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers logs <id>");
        process.exit(1);
      }
      await logs(id);
      break;
    }

    case "todos": {
      const [id] = args;
      await todos(id);
      break;
    }

    case "refresh": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers refresh <id>");
        process.exit(1);
      }
      await refresh(id);
      break;
    }

    case "watch": {
      const [id] = args;
      if (!id) {
        console.error("Error: worker id required");
        console.error("Usage: claude-workers watch <id>");
        process.exit(1);
      }
      await watch(id);
      break;
    }

    case "update": {
      await update();
      break;
    }

    case "history": {
      const [id] = args;
      await history(id);
      break;
    }

    case "assign": {
      await assign();
      break;
    }

    default:
      console.error(`Error: unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
