# Per-project config lives in a committed `.gitwtree.json`, gated by explicit trust

**Status:** accepted

`scanDirs`, `setup` and `teardown` move out of the global
`~/.config/git-wtree/config.json` and into a `.gitwtree.json` at the repo root, meant to be
committed. `setup` and `teardown` — the two keys that are shell commands — only run once the
file has been approved with `gwt trust`, which records a SHA-256 of its contents.

## Why

The global config was a single flat object shared by every repo on the machine, so the three
project-shaped keys clobbered each other: `gwt config setup "bundle install"` on a Ruby project
made a Node monorepo run `bundle install` on its next `gwt add`. Anyone using the tool on more
than one repo was silently mis-configured.

The keys are project-shaped, so the fix is to store them with the project. But `setup` and
`teardown` are **executed**, and a committed file that runs commands is a supply-chain vector —
sharper here than most, because `gwt pr` exists specifically to check out branches from forks the
user does not control.

Two mechanisms close that, and both are needed:

1. **The file is always read from the main worktree**, never from the worktree being created. A
   fork's `.gitwtree.json` is therefore never consulted, whatever `gwt pr` checks out. This also
   makes the config stable — it does not change under you when you switch branches.
2. **Executable keys require approval.** Cloning an untrusted repo and running `gwt add` would
   otherwise still execute its commands. `gwt trust` prints what the file wants to run, asks, and
   stores the hash; any later edit changes the hash and silently revokes trust, so a `git pull`
   that rewrites the commands re-prompts.

Trust is scoped to the executable keys only. A `.gitwtree.json` carrying just `scanDirs` is inert
data and applies with no prompt — which is most repos, so the common case has zero friction.

## Considered options

- **Keep the global file, key it by repo** (`repos: { "<url>": {…} }`). Rejected: it fixes the
  clobbering but the config stops at the machine — every teammate reconfigures by hand, a new
  laptop starts from scratch — and a stringly-keyed map rots silently when a remote or path
  changes, accumulating dead entries nothing ever collects. It is also a config format that would
  have to be migrated away from later; migrating once is cheaper than twice.
- **A committed file, read and executed directly.** Rejected: `git clone && gwt add` on any repo
  would run its author's commands. npm's `scripts` are the cautionary precedent.
- **Only non-executable keys in the repo file**, commands staying global. Rejected: splits the
  config across two places by a rule the user has to remember, and `setup` is the key most worth
  sharing.

The chosen shape is what direnv (`direnv allow`), mise (`mise trust`) and VS Code (Workspace
Trust) all converged on for the same problem.

## Consequences

- `gwt config scan-dirs|setup|teardown` now write `.gitwtree.json` and must run inside a repo.
  Writing through them re-trusts the result — you authored the change, so it needs no approval.
- The legacy top-level keys in the global config are still read, as a fallback when the repo file
  does not set them. Nothing breaks on upgrade; the first per-repo write starts the migration.
- An untrusted file does not fail the command. `gwt add` warns, skips the commands, and falls
  back to the global value or `auto` — refusing to create the worktree would punish the user for
  someone else's file.
- The trust store (`~/.config/git-wtree/trust.json`) is keyed by main-worktree path. A moved repo
  re-prompts once; a stale entry simply never matches, so it needs no cleanup.
- `.gitwtree.json` is meant to be committed. Unlike `.vscode/settings.json` and
  `.claude/settings.local.json`, it is deliberately **not** hidden from `git status`.
