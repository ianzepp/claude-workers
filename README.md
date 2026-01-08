# Claude Workers

Orchestration system for running multiple autonomous Claude Code agents without git conflicts.

## Design

### Problem

Running multiple Claude agents autonomously on GitHub issues requires:
- Git branch isolation (agents can't step on each other)
- Coordination (don't double-assign issues)
- Quality control (what happens when an agent produces garbage?)

### Solution: Sandboxed Worker Identities

Each worker is a fully isolated Claude "home" environment, not just a project clone.

```
~/workers/01/
  .claude/
    CLAUDE.md           # Worker identity + instructions
    settings.json       # Sandbox + permissions config
  .zshenv              # Environment variables (GH_TOKEN, etc.)
  task.json             # Current assignment (when busy)
  completed/            # Archived task history
  github/
    ianzepp/
      faber-romanus/    # Cloned on demand
      other-repo/
~/workers/02/
  ...
```

The worker is the identity. Launch with:

```bash
HOME=~/workers/01 claude
```

Claude Code finds its config at `$HOME/.claude/`, so each worker gets its own conversation history, settings, and project clones.

### Sandbox Isolation

Workers run in Claude Code's sandbox mode (Seatbelt on macOS, Bubblewrap on Linux) for OS-level isolation:

- **Filesystem**: Full read/write within worker's `$HOME`, blocked outside
- **Network**: Allowed for `.com`, `.io`, `.dev` domains

Worker `settings.json`:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowedDomains": ["*.com", "*.io", "*.dev"]
    }
  },
  "permissions": {
    "allow": ["Edit"],
    "defaultMode": "bypassPermissions"
  }
}
```

### Configuration

**Git credentials**: Copied (not symlinked) from `~/.gitconfig` and `~/.ssh/` at init time. Use `refresh` to update if credentials change.

**GitHub CLI**: `GH_TOKEN` environment variable is written to worker's `.zshenv` at init time. Ensure `GH_TOKEN` is set in your environment before running `init`.

**API key**: `ANTHROPIC_API_KEY` in environment, shared across workers.

**Worker identity**: Each `~/workers/NN/.claude/CLAUDE.md` identifies the worker and its branch prefix.

## CLI

```bash
claude-workers init <id>                                    # Create worker from template
claude-workers dispatch <id> <owner/repo> <issue#> [prompt] # Assign task and spawn worker
claude-workers status [id]                                  # Show worker status
claude-workers todos [id]                                   # Show worker todo lists
claude-workers refresh <id>                                 # Re-copy credentials and templates
claude-workers watch <id>                                   # Poll until worker finishes
```

### Dispatch

`dispatch` is fire-and-forget:
1. Writes `task.json` with assignment
2. Creates `worker:NN` label on the issue (auto-creates if needed)
3. Spawns worker process
4. Returns immediately

The orchestrating Claude (or human) moves on; the PR appears eventually.

Optional prompt argument scopes the task:

```bash
# Default: fix the issue
claude-workers dispatch 01 ianzepp/faber-romanus 22

# Custom prompt: investigate only
claude-workers dispatch 01 ianzepp/faber-romanus 22 "Investigate and comment, don't fix"

# Prompt from stdin
echo "Review for security issues" | claude-workers dispatch 01 ianzepp/faber-romanus 22
```

### Watch

`watch` polls a worker until it finishes, then exits. Useful for background monitoring:

```bash
# Run in background, get notified on completion
claude-workers watch 01 &
```

## Task Lifecycle

1. **Dispatch**: CLI writes `~/workers/NN/task.json` and labels issue with `worker:NN`

2. **Work**: Worker clones repo (if needed), creates branch `wNN/issue-XX`, reads project's `AGENTS.md`/`CLAUDE.md`, fetches issue, works on it.

3. **Complete**:
   - Success: push branch, open PR, add `pull-request` label, remove `worker:NN` label
   - Failure: comment on issue, leave `worker:NN` label for visibility

4. **Archive**: Move `task.json` to `completed/<owner>-<repo>-<issue>.json`

### Worker Availability

| State | Meaning |
|-------|---------|
| No `task.json` | Idle, available |
| `task.json` with valid PID | Busy |
| `task.json` with stale/no PID | Crashed, recoverable |

### Labels

| Label | Meaning |
|-------|---------|
| `worker:NN` | Issue claimed by worker NN |
| `pull-request` | PR created, awaiting review |

The `status` command queries GitHub for orphaned issues (labeled but worker idle/crashed).

### Recovery

If a worker crashes mid-task, `task.json` remains with the assignment but a stale PID. Re-dispatch to retry.

## Quality Control

- Workers push to branches (`wNN/issue-XX`), never to main
- All PRs require human review before merge
- Failed tasks leave `worker:NN` label for visibility

## Project Structure

```
claude-workers/
  bin/
    claude-workers          # CLI entrypoint (built)
  templates/
    worker/                 # Scaffolding for new workers
      .claude/
        CLAUDE.md
        settings.json
      .zshenv
  src/
    cli.ts
    commands/
      init.ts
      dispatch.ts
      status.ts
      todos.ts
      refresh.ts
      watch.ts
    lib/
      paths.ts
      task.ts
```

## Building

```bash
bun install
bun run build
```

## Usage Example

```bash
# Create workers
claude-workers init 01
claude-workers init 02

# Dispatch tasks
claude-workers dispatch 01 myorg/myrepo 42
claude-workers dispatch 02 myorg/myrepo 43

# Monitor progress
claude-workers todos
claude-workers status

# Wait for completion
claude-workers watch 01 &
claude-workers watch 02 &
```
