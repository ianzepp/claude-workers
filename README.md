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
~/workers/vilicus/      # PR review agent
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
  "model": "claude-opus-4-5-20250929",
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
claude-workers dispatch <id> <owner/repo> [issue#] [prompt] # Assign task and spawn worker
claude-workers restart <id>                                 # Restart crashed worker
claude-workers status [id]                                  # Show worker status
claude-workers inspect <id> [lines]                         # Show recent conversation activity
claude-workers todos [id]                                   # Show worker todo lists
claude-workers history [id]                                 # Show completed tasks
claude-workers refresh <id>                                 # Re-copy credentials and templates
claude-workers watch <id>                                   # Poll until worker finishes
claude-workers update                                       # Pull latest and refresh all workers
claude-workers poll                                         # Check for PRs and dispatch vilicus
claude-workers assign                                       # Assign unassigned issues to idle workers
```

### Dispatch

`dispatch` is fire-and-forget:
1. Writes `task.json` with assignment
2. Creates `worker:NN` label on the issue (if issue provided)
3. Spawns worker process
4. Returns immediately

The orchestrating Claude (or human) moves on; the PR appears eventually.

```bash
# Fix an issue
claude-workers dispatch 01 ianzepp/faber-romanus 22

# Custom prompt with issue
claude-workers dispatch 01 ianzepp/faber-romanus 22 "Investigate and comment, don't fix"

# Task without issue (prompt only)
claude-workers dispatch 01 ianzepp/faber-romanus "Clone and set up the repo"

# Prompt from stdin
echo "Review for security issues" | claude-workers dispatch 01 ianzepp/faber-romanus 22
```

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

### Poll

`poll` checks for PRs needing review and dispatches vilicus:

```bash
claude-workers poll           # Run once
*/5 * * * * cw poll           # Cron every 5 mins
```

### Assign

`assign` (dispensator) finds unassigned issues and dispatches idle workers:

```bash
claude-workers assign         # Run once
*/5 * * * * cw assign         # Cron every 5 mins
```

Issues are skipped if they have `worker:*`, `pull-request`, or `blocked` labels.

## Vilicus — Automated PR Review

**Vilicus** (Latin: overseer) is a special worker that reviews PRs created by other workers.

### Setup

```bash
claude-workers init vilicus
```

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Worker creates PR → adds pull-request label                │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    poll (every 5 min)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  vilicus reviews PR                                          │
│  - Checks code against issue requirements                   │
│  - Looks for previous rejection comments                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
          APPROVE        REJECT (1st)     BLOCK (2nd)
              ↓               ↓               ↓
          • Merge PR      • Comment        • Close PR
          • Close issue   • needs-work     • blocked label
          • Done          • Dispatch       • Human needed
                            worker
                              ↓
                          Worker fixes
                              ↓
                          pull-request
                              ↓
                          Back to poll
```

### Two-Strike Rule

- **First rejection**: vilicus comments with feedback, adds `needs-work` label, dispatches a worker to fix
- **Second rejection**: vilicus blocks the PR, closes it, labels issue as `blocked` for human intervention

### Labels

| Label | Meaning |
|-------|---------|
| `worker:NN` | Issue claimed by worker NN |
| `pull-request` | PR ready for vilicus review |
| `needs-work` | PR rejected, worker fixing |
| `blocked` | Failed twice, needs human |

## Task Lifecycle

1. **Dispatch**: CLI writes `~/workers/NN/task.json` and labels issue with `worker:NN`

2. **Work**: Worker clones repo (if needed), creates branch `wNN/issue-XX`, reads project's `AGENTS.md`/`CLAUDE.md`, fetches issue, works on it.

3. **Complete**:
   - Success: push branch, open PR, add `pull-request` label, remove `worker:NN` label
   - Failure: comment on issue, leave `worker:NN` label for visibility

4. **Review**: vilicus reviews PR, merges or rejects

5. **Archive**: Move `task.json` to `completed/<owner>-<repo>-<issue>.json`

### Worker Availability

| State | Meaning |
|-------|---------|
| No `task.json` | Idle, available |
| `task.json` with valid PID | Busy |
| `task.json` with stale/no PID | Crashed, recoverable |

### Recovery

If a worker crashes mid-task, `task.json` remains with the assignment but a stale PID. Re-dispatch to retry.

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
cw init vilicus
```

**8. Set up cron for automated review:**

```bash
crontab -e
# Add: */5 * * * * /usr/local/bin/cw poll >> /home/worker/poll.log 2>&1
```

### Usage

From your laptop:

```bash
alias cw='ssh worker@your-vps cw'
cw status
cw dispatch 01 owner/repo 42
cw history
cw poll
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
    vilicus/                # PR review agent template
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
      poll.ts
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
claude-workers init vilicus

# Dispatch tasks
claude-workers dispatch 01 myorg/myrepo 42
claude-workers dispatch 02 myorg/myrepo 43

# Monitor
claude-workers status
claude-workers todos

# View history
claude-workers history
```
