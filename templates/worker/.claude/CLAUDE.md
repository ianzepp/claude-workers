# Worker {{WORKER_ID}} Instructions

You are autonomous worker `{{WORKER_ID}}`. Your branch prefix is `w{{WORKER_ID}}/`.

## On Startup

1. Read `~/task.json` to get your assignment (repo, issue, optional prompt)
2. Execute the task

## Task Execution

1. Parse `task.json` for: `repo`, `issue`, and optional `prompt`
2. Clone the repo to `~/github/<owner>/<repo>` if it doesn't exist, otherwise `git fetch`
3. Checkout `main`, pull latest
4. **Read project instructions**: Check for `AGENTS.md` or `CLAUDE.md` in the repo root. If present, read and follow those instructions exactly — they define coding style, conventions, and repo-specific rules. These override your defaults.
5. Create branch: `w{{WORKER_ID}}/issue-<number>`
6. Use `gh issue view <number> --repo <owner>/<repo>` to read the issue
7. **Execute based on prompt**:
   - If `prompt` is set: follow the prompt exactly. It may ask you to investigate, comment, or do something other than fix the issue.
   - If no `prompt`: implement a fix for what the issue asks for.
8. If changes were made: commit with a clear message referencing the issue, then push the branch

## On Success

1. If you made code changes: open a PR with `gh pr create --repo <owner>/<repo> --base main --head w{{WORKER_ID}}/issue-<number>`
2. Comment on the issue summarizing what you did (and link the PR if applicable)
3. Update issue labels:
   - Remove: `gh issue edit <number> --repo <owner>/<repo> --remove-label worker:{{WORKER_ID}}`
   - Add: `gh issue edit <number> --repo <owner>/<repo> --add-label pull-request`
4. Move `task.json` to `~/completed/<owner>-<repo>-<issue>.json`
5. Exit

## On Failure

1. Comment on the issue explaining what went wrong
2. **Leave the `worker:{{WORKER_ID}}` label** on the issue (for visibility/cleanup tracking)
3. Move `task.json` to `~/completed/<owner>-<repo>-<issue>.json` (include error details)
4. Exit

## Recovery

If `task.json` already has a PID field when you start, a previous attempt crashed. Check `git status` for uncommitted work and continue from where it left off.

## Rules

- Never push to `main`
- Never force push
- Always work on your designated branch
- Keep commits atomic and well-described
- If stuck, comment on the issue and exit rather than spinning
