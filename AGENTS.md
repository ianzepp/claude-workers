# Claude Workers - Development Instructions

## Project Overview

Orchestration system for running multiple autonomous Claude Code agents in sandboxed worker environments. Each worker is a complete isolated identity with its own HOME directory, git config, conversation history, and task queue.

## Architecture

**Worker = Identity**
- Each worker is `$HOME` environment (`~/workers/01`, `~/workers/02`, etc.)
- Workers run `claude` with `HOME=~/workers/{id}`
- Complete isolation: own `.claude/`, `.ssh/`, `.gitconfig`, `github/` clones

**Two Execution Modes**:
1. **Issue-based workflow**: `dispatch -r repo -i issue` → worker implements fix, creates PR
2. **Agent-based workflow**: `dispatch -r repo -p "<agent prompt>"` → worker executes agent instructions

## Core Components

### dispatch.ts
Orchestrates worker execution:
- Writes `task.json` with assignment (repo, issue, prompt)
- Writes `prompt.txt` if custom prompt provided (for agent mode)
- Spawns `claude` with `HOME=~/workers/{id}`
- Detached process, logs to `worker.log`

**Agent integration**:
```typescript
// Write prompt to file (avoids shell escaping issues)
const promptPath = join(home, "prompt.txt");
await writeFile(promptPath, taskPrompt, "utf-8");

// Start Claude, tells it to read prompt.txt
const startPrompt = taskPrompt
  ? "Read ~/prompt.txt and execute those instructions exactly."
  : "Read ~/task.json and execute the task following your CLAUDE.md instructions.";
```

### Worker Template (templates/worker/)

**CLAUDE.md**: Worker identity and task execution logic
- Reads `task.json` via bash (Read tool ignores HOME env)
- Checks for `prompt.txt` (agent mode)
- If `prompt.txt` exists: execute agent instructions in repo context
- If empty/missing: continue with issue-based workflow

**settings.json**: Sandbox and permissions config
- `sandbox.enabled: true`
- Permissions allow Edit, WebFetch for common domains
- `defaultMode: "bypassPermissions"` for autonomous operation

**WHY bash for file reads in worker HOME**:
Claude's Read tool doesn't respect the `HOME` environment variable. It resolves `~/` to the actual user home directory instead of the worker's HOME. Worker template uses bash (`cat task.json`, `cat prompt.txt`) to read files in the worker's HOME directory.

## Development Workflow

### Adding New Commands

1. Create `src/commands/{name}.ts`
2. Import in `src/cli.ts`
3. Add to usage string
4. Add case to command switch
5. Rebuild: `bun run build`

### Modifying Worker Template

Worker template changes affect new workers and refreshes:

```bash
# Edit template
vim templates/worker/.claude/CLAUDE.md

# Refresh existing workers
claude-workers refresh 01
# OR refresh all
claude-workers update
```

**Template variables**: `{{WORKER_ID}}` is replaced with actual ID during init/refresh.

### Testing Locally

```bash
# Create local test worker
HOME=~/workers/01 bun src/cli.ts init 01

# Test dispatch
echo "test prompt" | bun src/cli.ts dispatch -r owner/repo -w 01

# Check output
cat ~/workers/01/worker.log
```

### Integration with claude-agents

The [claude-agents](https://github.com/ianzepp/claude-agents) project provides specialized diagnostic agents (augur, columbo, galen, titus, cato, diogenes). These agents can be dispatched to remote workers:

```bash
cd ~/github/owner/repo
agent diogenes --dispatch --mode issue "explore and suggest improvements"
```

**Flow**:
1. `agent.sh` builds full agent prompt (agent definition + mode instructions + goal)
2. Pipes prompt to `cw dispatch -r <repo> -m <model>` via stdin
3. `dispatch` writes prompt to `~/workers/{id}/prompt.txt`
4. Worker reads `prompt.txt` via bash, executes in repo context
5. Worker outputs findings (logs, issues, PRs depending on mode)

## Code Conventions

### TypeScript

- Use Bun's TypeScript runtime (no compilation needed)
- Prefer `spawnSync` for short commands, `spawn` for long-running
- Always set `encoding: "utf-8"` on spawn options
- Use `writeFile` with explicit encoding for text files

### Worker Isolation

- **Never** use `~/.` paths in worker code (breaks isolation)
- Use `workerHome(id)` from `lib/paths.ts` for worker directories
- All file operations must be relative to worker home
- Bash commands in workers can use relative paths (cwd is worker home)

### Error Handling

- Validate inputs early (repo format, worker exists, etc.)
- Clear error messages: what failed, why, how to fix
- Exit codes: 0 = success, 1 = user error, other = system error
- `spawnSync` commands: check `result.status !== 0`

## Testing

Before committing:

1. **Build succeeds**: `bun run build`
2. **Local worker test**:
   ```bash
   echo "test task" | ./bin/claude-workers dispatch -r ianzepp/claude-workers -w 01
   ./bin/claude-workers status 01
   ./bin/claude-workers logs 01
   ./bin/claude-workers reset 01
   ```
3. **Remote worker test** (if VPS access):
   ```bash
   cw update
   cw status
   ```

## Deployment

### Local Development
```bash
bun run build
./bin/claude-workers <command>
```

### Remote VPS
```bash
# One-time setup
git clone https://github.com/ianzepp/claude-workers.git
cd claude-workers
bun install
bun run build

# Create symlink
ln -s ~/claude-workers/bin/claude-workers /usr/local/bin/cw

# Create workers
cw init 01
cw init 02
...

# Updates
cw update  # Pulls git, rebuilds, refreshes all workers
```

### Cron Job (Auto-assignment)
```cron
*/5 * * * * cw assign
```

## Common Patterns

### Spawning Workers

Always use detached processes for workers:
```typescript
const child = spawn("claude", args, {
  cwd: home,
  env: { ...process.env, HOME: home },
  detached: true,
  stdio: ["ignore", logFile.fd, logFile.fd],
});
child.unref();
```

### Reading Worker State

Status derived from `task.json` existence + PID check:
```typescript
const task = await readTask(id);  // null if no task
if (!task) return { status: "idle" };
if (!isProcessRunning(task.pid)) return { status: "crashed" };
return { status: "busy" };
```

### Task Archival

Move `task.json` to `completed/` on finish:
```typescript
const timestamp = new Date().toISOString().replace(/:/g, "-");
const archivePath = join(home, "completed", `${repo.replace("/", "-")}-${issue}-${timestamp}.json`);
await rename(taskPath, archivePath);
```

## Design Principles

### Workers Are Vessels

Workers have minimal opinions. They:
- Read task assignments
- Execute instructions (from CLAUDE.md or prompt.txt)
- Log output
- Exit

Complexity lives in the task definitions (CLAUDE.md, prompt.txt, issue descriptions), not the worker scaffolding.

### Fail Fast, Fail Loud

Prefer clear errors over silent failures:
- Missing repo? Error immediately.
- Worker busy? Fail dispatch with clear message.
- Malformed task.json? Crash with diagnostic.

### Trust the Sandbox

Workers run in Claude Code's sandbox. Rely on it:
- No manual permission checking
- No filesystem restrictions beyond sandbox
- Network allowed for common domains

### Agent Delegation

Workers support two modes by design:
1. **Issue fixer**: Traditional PR workflow
2. **Agent executor**: Run specialized diagnostic agents

This enables both autonomous issue resolution AND targeted codebase analysis/exploration. The same infrastructure serves both use cases.
