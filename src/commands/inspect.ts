import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { workerHome } from "../lib/paths.ts";

interface Message {
  type: string;
  message?: {
    role?: string;
    content?:
      | Array<{
          type: string;
          text?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>
      | string;
  };
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 3) + "...";
}

async function findLatestConversation(id: string): Promise<string | null> {
  const home = workerHome(id);
  const projectsDir = join(home, ".claude", "projects");

  // Find project directory (encoded path)
  let projectDir: string;
  try {
    const dirs = await readdir(projectsDir);
    const projectDirs = dirs.filter((d) => d.startsWith("-"));
    if (projectDirs.length === 0) {
      return null;
    }
    projectDir = join(projectsDir, projectDirs[0]);
  } catch {
    return null;
  }

  // Find most recent JSONL (exclude agent-* files)
  const files = await readdir(projectDir);
  const jsonlFiles = files
    .filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
    .map((f) => ({ name: f, path: join(projectDir, f) }));

  if (jsonlFiles.length === 0) {
    return null;
  }

  // Get modification times and sort
  const withStats = await Promise.all(
    jsonlFiles.map(async (f) => {
      const stat = await Bun.file(f.path).stat();
      return { ...f, mtime: stat?.mtime ?? 0 };
    })
  );
  withStats.sort((a, b) => Number(b.mtime) - Number(a.mtime));
  return withStats[0].path;
}

function processLine(line: string): string[] {
  const events: string[] = [];
  try {
    const msg: Message = JSON.parse(line);

    if (msg.type === "assistant" && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use" && block.name) {
            let detail = "";
            if (block.name === "Bash" && block.input?.command) {
              detail = ` ${truncate(String(block.input.command), 60)}`;
            } else if (block.name === "Read" && block.input?.file_path) {
              detail = ` ${block.input.file_path}`;
            } else if (block.name === "Edit" && block.input?.file_path) {
              detail = ` ${block.input.file_path}`;
            } else if (block.name === "Write" && block.input?.file_path) {
              detail = ` ${block.input.file_path}`;
            } else if (block.name === "Grep" && block.input?.pattern) {
              detail = ` "${block.input.pattern}"`;
            } else if (block.name === "Glob" && block.input?.pattern) {
              detail = ` ${block.input.pattern}`;
            } else if (block.name === "TodoWrite") {
              detail = " (updating todos)";
            }
            events.push(`\x1b[33m→\x1b[0m ${block.name}${detail}`);
          } else if (block.type === "text" && block.text) {
            const text = truncate(block.text.replace(/\n/g, " "), 80);
            events.push(`\x1b[36m◇\x1b[0m ${text}`);
          }
        }
      }
    }
  } catch {
    // Skip unparseable lines
  }
  return events;
}

export async function inspect(id: string, lines = 30, follow = false): Promise<void> {
  const conversationPath = await findLatestConversation(id);
  if (!conversationPath) {
    console.log("No conversation history found");
    return;
  }

  if (follow) {
    // Follow mode: tail -f behavior
    console.log(`Following worker ${id} (Ctrl+C to exit)...\n`);

    let lastPosition = 0;

    // Initial read to get current position
    const initialContent = await readFile(conversationPath, "utf-8");
    const initialLines = initialContent.trim().split("\n");
    lastPosition = initialContent.length;

    // Show last N events initially
    const initialEvents: string[] = [];
    for (const line of initialLines.slice(-lines * 2)) {
      initialEvents.push(...processLine(line));
    }
    for (const event of initialEvents.slice(-lines)) {
      console.log(event);
    }

    // Poll for new content
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const content = await readFile(conversationPath, "utf-8");
      if (content.length > lastPosition) {
        const newContent = content.slice(lastPosition);
        const newLines = newContent.trim().split("\n");

        for (const line of newLines) {
          if (line.trim()) {
            const events = processLine(line);
            for (const event of events) {
              console.log(event);
            }
          }
        }

        lastPosition = content.length;
      }
    }
  }

  // Normal mode: show last N events
  const content = await readFile(conversationPath, "utf-8");
  const allLines = content.trim().split("\n");
  const recentLines = allLines.slice(-lines * 2); // Read more, filter to N events

  const events: string[] = [];
  for (const line of recentLines) {
    events.push(...processLine(line));
  }

  // Show last N events
  const output = events.slice(-lines);
  if (output.length === 0) {
    console.log("No recent activity");
    return;
  }

  console.log(`Recent activity for worker ${id}:\n`);
  for (const event of output) {
    console.log(event);
  }
}
