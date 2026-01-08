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
claude-workers update                                       # Pull latest and refresh all workers
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

### Update

`update` pulls the latest claude-workers from git, rebuilds, and refreshes all workers with updated templates:

```bash
claude-workers update
```

This is useful after upstream changes to worker templates (CLAUDE.md, settings.json) or CLI fixes. The command:
1. Runs `git pull` in the claude-workers repo
2. Runs `bun run build` to rebuild the CLI
3. Runs `refresh` on every worker to apply template updates

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

## Remote Workers

Workers can run on a remote VPS for laptop-independent execution. The approach: deploy `claude-workers` on the VPS and execute commands via SSH.

### Why This Works

The dispatch command spawns workers with `detached: true` and `unref()`, making them fully independent of the parent process. Status detection uses filesystem checks (`task.json`) and PID probing (`kill -0`), not parent/child relationships. SSH can disconnect immediately after dispatch—workers keep running.

### VPS Setup

Tested on Ubuntu 24.04 (DigitalOcean droplet, 2GB RAM).

**1. Install Bun:**

```bash
curl -fsSL https://bun.sh/install | bash
ln -sf ~/.bun/bin/bun /usr/local/bin/bun
ln -sf ~/.bun/bin/bunx /usr/local/bin/bunx
```

**2. Install Node.js** (required by Claude Code CLI):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

**3. Install GitHub CLI:**

```bash
apt-get install -y gh
```

**4. Install Claude Code CLI:**

```bash
bun install -g @anthropic-ai/claude-code
ln -sf ~/.bun/bin/claude /usr/local/bin/claude
```

**5. Configure credentials** in `/root/.profile`:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GH_TOKEN="ghp_..."
```

**6. Configure git:**

```bash
git config --global user.name "Claude Worker"
git config --global user.email "worker@localhost"
gh auth setup-git  # Uses GH_TOKEN for HTTPS auth
```

**7. Clone and build claude-workers:**

```bash
cd ~
git clone https://github.com/ianzepp/claude-workers.git
cd claude-workers
bun install && bun run build
ln -sf ~/claude-workers/bin/claude-workers /usr/local/bin/claude-workers
```

**8. Initialize workers:**

```bash
source ~/.profile  # Load credentials
claude-workers init 01
claude-workers init 02
```

The symlinks to `/usr/local/bin` are important—SSH command execution doesn't source shell profiles, so binaries must be in the default PATH.

### Usage

From your laptop, SSH exec commands directly:

```bash
ssh root@your-vps "claude-workers dispatch 01 owner/repo 42"
ssh root@your-vps "claude-workers status"
ssh root@your-vps "claude-workers todos"
```

Or create an alias:

```bash
alias cw='ssh root@your-vps claude-workers'
cw dispatch 01 owner/repo 42
cw status
cw todos 01
```

### Multiple Hosts

Each VPS is an independent claude-workers host with its own credentials. Use different aliases for different hosts:

```bash
alias cw-prod='ssh root@prod-vps claude-workers'
alias cw-dev='ssh root@dev-vps claude-workers'
```

This allows separate credential sets, different worker pools, or geographic distribution.

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
