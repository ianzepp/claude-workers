#!/usr/bin/env bun

import { init } from "./commands/init.ts";
import { dispatch } from "./commands/dispatch.ts";
import { status } from "./commands/status.ts";
import { refresh } from "./commands/refresh.ts";
import { watch } from "./commands/watch.ts";
import { todos } from "./commands/todos.ts";
import { update } from "./commands/update.ts";

const USAGE = `
claude-workers - Orchestration for autonomous Claude Code agents

Usage:
  claude-workers init <id>                                    Create worker from template
  claude-workers dispatch <id> <owner/repo> <issue#> [prompt] Assign task and spawn worker
  claude-workers status [id]                                  Show worker status
  claude-workers todos [id]                                   Show worker todo lists
  claude-workers refresh <id>                                 Re-copy credentials to worker
  claude-workers watch <id>                                   Poll until worker finishes
  claude-workers update                                       Pull latest and refresh all workers

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
      const [id, repo, issueStr, ...promptParts] = args;
      if (!id || !repo || !issueStr) {
        console.error("Error: worker id, repo, and issue number required");
        console.error("Usage: claude-workers dispatch <id> <owner/repo> <issue#> [prompt]");
        process.exit(1);
      }
      const issue = parseInt(issueStr, 10);
      if (isNaN(issue)) {
        console.error(`Error: invalid issue number: ${issueStr}`);
        process.exit(1);
      }
      const prompt = promptParts.length > 0 ? promptParts.join(" ") : undefined;
      await dispatch(id, repo, issue, prompt);
      break;
    }

    case "status": {
      const [id] = args;
      await status(id);
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
