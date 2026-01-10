# Claude Workers

Orchestration system for running multiple autonomous Claude Code agents without git conflicts.

## Design

### Problem

Running multiple Claude agents autonomously on GitHub issues requires:
- Git branch isolation (agents can't step on each other)
- Coordination (don't double-assign issues)

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
    "enabled": true
  },
  "permissions": {
    "allow": [
      "Edit",
      "WebFetch(domain:*.com)",
      "WebFetch(domain:*.io)",
      "WebFetch(domain:*.dev)"
    ],
    "defaultMode": "bypassPermissions"
  }
}
```

### Configuration

**Git credentials**: Copied (not symlinked) from `~/.gitconfig` and `~/.ssh/` at init time. Use `refresh` to update if credentials change.

**GitHub CLI**: `GH_TOKEN` environment variable is written to worker's `.zshenv` at init time. Ensure `GH_TOKEN` is set in your environment before running `init`.

**API key**: Either `ANTHROPIC_API_KEY` (pay-per-use) or `CLAUDE_CODE_OAUTH_TOKEN` (Max subscription via `claude setup-token`).

**Worker identity**: Each `~/workers/NN/.claude/CLAUDE.md` identifies the worker and its branch prefix.

## CLI

```bash
claude-workers init <id>                                    # Create worker from template
claude-workers dispatch -r <repo> [-i issue] [-w worker] [-p prompt] [-m model]
claude-workers restart <id>                                 # Restart crashed worker
claude-workers reset <id> [--force]                         # Clear task and return to idle
claude-workers stop <id>                                    # Stop running worker
claude-workers status [id]                                  # Show worker status
claude-workers inspect <id> [lines]                         # Show recent conversation activity
claude-workers logs <id>                                    # Show full worker log output
claude-workers todos [id]                                   # Show worker todo lists
claude-workers history [id]                                 # Show completed tasks
claude-workers refresh <id>                                 # Re-copy credentials and templates
claude-workers watch <id>                                   # Poll until worker finishes
claude-workers update                                       # Pull latest and refresh all workers
claude-workers assign                                       # Assign open issues to idle workers
```

### Dispatch

`dispatch` is fire-and-forget:
1. Writes `task.json` with assignment
2. Creates `worker:NN` label on the issue (if issue provided)
3. Spawns worker process with specified model
4. Returns immediately

The orchestrating Claude (or human) moves on; the PR appears eventually.

```bash
# Fix an issue (auto-selects idle worker, uses sonnet by default)
claude-workers dispatch -r ianzepp/faber-romanus -i 22

# Use opus for complex issues
claude-workers dispatch -r ianzepp/faber-romanus -i 22 -m opus

# Specify worker
claude-workers dispatch -r ianzepp/faber-romanus -i 22 -w 01

# Custom prompt
claude-workers dispatch -r ianzepp/faber-romanus -i 22 -p "Investigate and comment, don't fix"

# Task without issue
claude-workers dispatch -r ianzepp/faber-romanus -p "Clone and set up the repo"
```

### Model Selection

Workers default to Sonnet for speed and cost efficiency. Use `-m opus` for complex issues requiring more reasoning:

| Model | Flag | Best for |
|-------|------|----------|
| Sonnet | `-m sonnet` (default) | Well-scoped issues, straightforward implementations |
| Opus | `-m opus` | Architectural decisions, ambiguous requirements |

### Watch

`watch` polls a worker until it finishes, then exits:

```bash
claude-workers watch 01 &
```

### Update

`update` pulls the latest claude-workers from git, rebuilds, and refreshes all workers:

```bash
claude-workers update
```

### History

`history` shows completed tasks:

```bash
claude-workers history        # All workers
claude-workers history 01     # Specific worker
```

### Assign

`assign` finds open issues and dispatches idle workers:

```bash
claude-workers assign         # Run once
*/5 * * * * cw assign         # Cron every 5 mins
```

Issues are skipped if they have `worker:*` or `blocked` labels.

### Reset

`reset` clears a crashed worker and removes its label from the issue:

```bash
claude-workers reset 01       # Clear crashed task, remove worker:01 label
claude-workers reset 01 -f    # Force reset even if running
```

### Agent Integration

Workers support running specialized agents from [claude-agents](https://github.com/ianzepp/claude-agents) for diagnostic and exploration tasks.

**How it works:**
1. Agent prompt is piped through stdin to `dispatch`
2. Prompt is written to `~/workers/{id}/prompt.txt`
3. Worker reads `prompt.txt` via bash (on startup)
4. Worker executes agent instructions in the repo context
5. Worker outputs findings and exits

**Example with diogenes (free-spirit explorer):**

```bash
cd ~/github/owner/repo
agent diogenes --dispatch --mode issue "explore and suggest improvements"
```

This dispatches the full diogenes agent prompt to a remote worker. The worker:
- Clones the repo
- Reads the agent prompt from `prompt.txt`
- Explores the codebase following agent instructions
- Creates GitHub issues for findings (in `--mode issue`)

**View full output:**

```bash
claude-workers logs 01        # Full conversation log
claude-workers inspect 01 50  # Recent activity (last 50 lines)
```

**Supported workflows:**
- **read mode**: Agent analyzes and outputs report
- **update mode**: Agent makes changes and commits
- **issue mode**: Agent creates GitHub issues for findings

See [claude-agents](https://github.com/ianzepp/claude-agents) for available agents (augur, columbo, galen, titus, cato, diogenes).

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Issue created                                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    assign (cron, every 5 min)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Worker picks up issue                                       │
│  - Adds worker:NN label                                      │
│  - Clones repo, creates branch                               │
│  - Implements fix                                            │
│  - Opens PR                                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Human reviews PRs                                           │
│  - Batch review with Claude assistance                       │
│  - Approve/reject each PR                                    │
│  - Merge approved PRs                                        │
└─────────────────────────────────────────────────────────────┘
```

### Labels

| Label | Meaning |
|-------|---------|
| `worker:NN` | Issue claimed by worker NN |
| `blocked` | Needs human intervention |

## Task Lifecycle

1. **Dispatch**: CLI writes `~/workers/NN/task.json` and labels issue with `worker:NN`

2. **Work**: Worker clones repo (if needed), creates branch `issue-<number>`, reads project's `AGENTS.md`/`CLAUDE.md`, fetches issue, works on it.

3. **Complete**:
   - Success: push branch, open PR, remove `worker:NN` label
   - Failure: comment on issue, leave `worker:NN` label for visibility

4. **Archive**: Move `task.json` to `completed/<owner>-<repo>-<issue>.json`

5. **Review**: Human reviews PR (with Claude assistance), merges or closes

### Worker Availability

| State | Meaning |
|-------|---------|
| No `task.json` | Idle, available |
| `task.json` with valid PID | Busy |
| `task.json` with stale/no PID | Crashed, recoverable |

### Recovery

If a worker crashes mid-task:

```bash
claude-workers status         # See crashed state
claude-workers reset 01       # Clear task, remove label from issue
claude-workers dispatch ...   # Re-dispatch if needed
```

The `reset` command automatically removes the `worker:NN` label from the issue, making it available for re-assignment.

## Remote Workers (VPS)

Workers can run on a remote VPS for laptop-independent execution. The approach: deploy `claude-workers` on the VPS and execute commands via SSH.

### Why This Works

The dispatch command spawns workers with `detached: true` and `unref()`, making them fully independent of the parent process. SSH can disconnect immediately after dispatch—workers keep running.

### VPS Setup

Tested on Ubuntu 24.04 (DigitalOcean droplet, 2GB RAM). Run as a **non-root user** (Claude Code refuses `--dangerously-skip-permissions` as root).

**1. Create worker user** (as root):

```bash
useradd -m -s /bin/bash worker
cp ~/.ssh/authorized_keys /home/worker/.ssh/
chown -R worker:worker /home/worker/.ssh
```

**2. Install dependencies** (as root):

```bash
# Bun
curl -fsSL https://bun.sh/install | bash
ln -sf ~/.bun/bin/bun /usr/local/bin/bun

# Node.js (required by Claude Code)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs gh
```

**3. As worker user**, install Claude Code and clone repo:

```bash
su - worker
curl -fsSL https://bun.sh/install | bash
~/.bun/bin/bun install -g @anthropic-ai/claude-code

git clone https://github.com/ianzepp/claude-workers.git
cd claude-workers && bun install && bun run build
```

**4. Configure credentials** in `/home/worker/.profile`:

```bash
export PATH="/home/worker/claude-workers/bin:/home/worker/.bun/bin:$PATH"
export CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat01-..."  # From: claude setup-token
export GH_TOKEN="ghp_..."
```

**5. Configure git:**

```bash
git config --global user.name "Claude Worker"
git config --global user.email "worker@localhost"
gh auth setup-git
```

**6. Create wrapper script** (as root):

```bash
cat > /usr/local/bin/cw << 'EOF'
#!/bin/bash
source /home/worker/.profile
exec /home/worker/claude-workers/bin/claude-workers "$@"
EOF
chmod +x /usr/local/bin/cw
```

**7. Initialize workers:**

```bash
cw init 01
cw init 02
```

**8. Set up cron for auto-assignment:**

```bash
crontab -e
# Add: */5 * * * * /usr/local/bin/cw assign >> /home/worker/assign.log 2>&1
```

### Usage

From your laptop:

```bash
alias cw='ssh worker@your-vps cw'
cw status
cw dispatch -r owner/repo -i 42
cw history
```

## Project Structure

```
claude-workers/
  bin/
    claude-workers          # CLI entrypoint (built)
  templates/
    worker/                 # Standard worker template
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
      history.ts
      refresh.ts
      watch.ts
      update.ts
      assign.ts
      reset.ts
    lib/
      paths.ts
      task.ts
```

## Building

```bash
bun install
bun run build
```

## Quick Start

```bash
# Create workers
claude-workers init 01
claude-workers init 02

# Dispatch tasks
claude-workers dispatch -r myorg/myrepo -i 42
claude-workers dispatch -r myorg/myrepo -i 43 -m opus

# Monitor
claude-workers status
claude-workers todos

# View history
claude-workers history
```
