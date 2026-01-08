#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { dispatch } from "./commands/dispatch.ts";
import { restart } from "./commands/restart.ts";
import { status } from "./commands/status.ts";
import { inspect } from "./commands/inspect.ts";
import { refresh } from "./commands/refresh.ts";
import { watch } from "./commands/watch.ts";
import { todos } from "./commands/todos.ts";
import { update } from "./commands/update.ts";
import { history } from "./commands/history.ts";
import { poll } from "./commands/poll.ts";

const USAGE = `
claude-workers - Orchestration for autonomous Claude Code agents

Usage:
  claude-workers init <id>                                    Create worker from template
  claude-workers dispatch <id> <owner/repo> [issue#] [prompt] Assign task and spawn worker
  claude-workers restart <id>                                 Restart crashed worker
  claude-workers status [id]                                  Show worker status
  claude-workers inspect <id> [lines]                         Show recent conversation activity
  claude-workers todos [id]                                   Show worker todo lists
  claude-workers refresh <id>                                 Re-copy credentials to worker
  claude-workers watch <id>                                   Poll until worker finishes
  claude-workers update                                       Pull latest and refresh all workers
  claude-workers history [id]                                 Show completed tasks
  claude-workers poll                                         Check for PRs and dispatch vilicus

Dispatch reads prompt from stdin if not provided as argument (EOF = no prompt).

Examples:
  claude-workers init 01
  claude-workers dispatch 01 ianzepp/faber-romanus 22
  claude-workers dispatch 01 ianzepp/faber-romanus 22 "Investigate only"
  echo "Fix the bug" | claude-workers dispatch 01 ianzepp/faber-romanus 22
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
      const [id, repo, thirdArg, ...rest] = args;
      if (!id || !repo) {
        console.error("Error: worker id and repo required");
        console.error("Usage: claude-workers dispatch <id> <owner/repo> [issue#] [prompt]");
        process.exit(1);
      }
      // If third arg is a number, it's an issue. Otherwise it's the start of the prompt.
      let issue: number | undefined;
      let promptParts: string[];
      if (thirdArg && !isNaN(parseInt(thirdArg, 10))) {
        issue = parseInt(thirdArg, 10);
        promptParts = rest;
      }
      else {
        issue = undefined;
        promptParts = thirdArg ? [thirdArg, ...rest] : rest;
      }
      const prompt = promptParts.length > 0 ? promptParts.join(" ") : undefined;
      await dispatch(id, repo, issue, prompt);
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

    case "poll": {
      await poll();
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
