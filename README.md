# git-wtree

> Git worktree manager with .env syncing and IDE integration

Streamline your git worktree workflow: create isolated branches, sync environment files, install dependencies, give each worktree its own editor color, and open your IDE — all in one command.

## Install

```bash
npm install -g git-wtree
```

## Usage

```bash
gitwtree <command>
# or
gwt <command>
```

## Shell integration (recommended)

Add this once to your shell rc — it enables `gwt switch` (jumping between worktrees) and, on zsh + oh-my-zsh, frees the `gwt` name from the git plugin's alias:

```bash
# ~/.zshrc (after sourcing oh-my-zsh) — or ~/.bashrc / config.fish
eval "$(gitwtree shell-init zsh)"   # or: bash | fish
```

Then restart your shell (or `source ~/.zshrc`).

> **Why `gitwtree` and not `gwt` here?** oh-my-zsh's git plugin aliases `gwt` (and `gwta`, `gwtls`, …) to `git worktree`, which shadows this CLI. `gitwtree` is never aliased, so the bootstrap always works; the snippet it prints clears those aliases and defines a `gwt` function that wins. If you skip this step and `gwt` runs `git worktree`, that alias is why — run `gitwtree` directly, or add the integration above.

### Commands

| Command                             | Description                                                   |
| ----------------------------------- | ------------------------------------------------------------- |
| `gwt add <branch> [--from <base>]`  | Create a worktree, sync `.env` files, and run the setup hook  |
| `gwt pr <number>`                   | Create a worktree from a GitHub pull request                  |
| `gwt rm [branch] [--force]`         | Remove a worktree (picker if omitted; guards unsaved changes) |
| `gwt ls`                            | List all worktrees                                            |
| `gwt open [branch]`                 | Open a worktree in your IDE (picker if omitted)               |
| `gwt switch [query]`                | `cd` to another worktree (needs the shell wrapper)            |
| `gwt shell-init [shell]`            | Print the shell function enabling `gwt switch`                |
| `gwt sync-env [query] [--apply]`    | Re-copy `.env` from main into a worktree (`--all` for every)  |
| `gwt config`                        | Show current configuration                                    |
| `gwt config ide`                    | Configure your IDE                                            |
| `gwt config scan-dirs [dirs]`       | Set directories to scan for `.env` files                      |
| `gwt config setup [commands...]`    | Post-create commands (`auto` / `none` / custom)               |
| `gwt config teardown [commands...]` | Pre-remove commands run in the worktree (`none` to clear)     |
| `gwt config theme [on\|off]`        | Toggle per-worktree VS Code color + window title              |
| `gwt config statusline [on\|off]`   | Toggle the Claude Code branch statusline                      |
| `gwt help`                          | Show help                                                     |

### `gwt add <branch>`

Creates a git worktree for the given branch, copies `.env` files from the main repo, and runs the [setup hook](#setup--teardown-hooks).

- If the branch **doesn't exist**, it's created from `HEAD` by default — use `--from` to specify a different base.
- If the branch **already exists locally**, it fetches the latest remote changes and resets to them (handles force-pushes cleanly).

```bash
gwt add my-feature                     # create from HEAD
gwt add my-feature --from production   # create from production
gwt add codex/fix-bug                  # checkout existing branch, reset to remote
```

### `gwt pr <number>`

Creates a worktree from a GitHub pull request (then runs the same `.env` sync, setup hook, and theming as `gwt add`). The worktree lives at `<repo>-pr-<number>`.

```bash
gwt pr 1234   # specific PR
gwt pr        # no number → pick from open PRs (arrow-key picker, requires gh)
```

- If [`gh`](https://cli.github.com/) is installed, it runs `gh pr checkout` inside the worktree — you get the PR's real branch with push tracking (works for forks too), so you can push fixes back.
- Otherwise it falls back to `git fetch origin pull/<number>/head` into a local `pr-<number>` branch (review only).

### `gwt open [branch]`

Opens a worktree in your configured IDE. On first use, a wizard will prompt you to choose your IDE.

```bash
gwt open my-feature   # substring match on branch or path
gwt open              # no argument → arrow-key picker
```

Worktrees are resolved from `git worktree list` (the same source as `gwt ls`): the argument is matched as a substring of the branch or path, and you get a picker when it's ambiguous or omitted. The same resolution powers `gwt switch` and `gwt rm`, so a PR worktree (dir `repo-pr-<n>`, different branch) is found whether you pass its branch, `pr-<n>`, or pick it.

To reconfigure your IDE at any time:

```bash
gwt config ide
```

### `gwt switch` — jump between worktrees

`gwt switch [query]` changes your shell's directory to another worktree. Because a binary can't change its parent shell's working directory, this needs a small shell function. Add it to your shell rc once:

```bash
# ~/.zshrc or ~/.bashrc
eval "$(gwt shell-init zsh)"   # or: bash | fish
```

Then:

```bash
gwt switch my-feature   # cd to the worktree whose branch matches "my-feature"
gwt switch              # no query → arrow-key picker
gwt sw my-feature       # alias
```

`query` is a substring match on the branch name. If it matches exactly one worktree you go straight there; if it's ambiguous or omitted, you get an arrow-key picker (same style as the rest of the prompts). (`gwt path [query]` is the underlying primitive the wrapper calls — it resolves the worktree and writes the path back to the wrapper.)

### `.env` syncing

By default, `gwt add` recursively scans the repo for `.env*` files (excluding `node_modules`, `.git`, `dist`, etc.) and copies them into the new worktree.

To restrict scanning to specific directories:

```bash
gwt config scan-dirs apps/api,apps/web
```

To reset back to auto scan:

```bash
gwt config scan-dirs --reset
```

#### Re-syncing after the fact

`gwt add` only copies `.env` files at creation time. When you refresh them on your main checkout (e.g. after pulling a new database), `gwt sync-env` re-copies them into existing worktrees. The **main worktree is always the source** (detected automatically, so it works from any worktree); it's never a target.

It is a **dry run by default** — it lists, per worktree, which files would be copied and which would **overwrite** an existing one — and only writes with `--apply`:

```bash
gwt sync-env                  # pick a worktree, preview the changes
gwt sync-env my-feature       # preview for the worktree matching "my-feature"
gwt sync-env my-feature --apply   # actually copy into that worktree
gwt sync-env --all            # preview across every secondary worktree
gwt sync-env --all --apply    # copy into all of them
```

### Setup & teardown hooks

`gwt add` runs a **setup** hook after creating the worktree, and `gwt rm` runs a **teardown** hook before removing it. Both run inside the worktree.

**Setup** defaults to `auto`: if a `package.json` is present it runs `<package-manager> install` (plus `<pm> run prepare` when that script exists); otherwise it does nothing — so non-Node repos stay untouched. Override it with your own commands for any stack:

```bash
gwt config setup                              # show current value
gwt config setup "bundle install"             # Ruby
gwt config setup "go mod download" "make dev" # multiple commands, in order
gwt config setup none                         # do nothing
gwt config setup auto                         # back to auto-detection
```

**Teardown** is empty by default. Use it to release resources tied to a worktree (databases, containers, ports) before it's deleted. If a teardown command fails, removal is aborted unless you pass `--force`:

```bash
gwt config teardown "docker compose down"
gwt config teardown none                      # clear
```

### Removing worktrees

`gwt rm <branch>` refuses to remove a worktree that has uncommitted changes, untracked files, or unpushed commits — to avoid losing work. Re-run with `--force` to remove anyway:

```bash
gwt rm my-feature
gwt rm my-feature --force
```

### Worktree theming

To make parallel windows easy to tell apart, `gwt add` gives each worktree its own visual identity:

- A **deterministic color** (derived from the branch name) is applied to the VS Code / Cursor title bar and activity bar, plus a worktree-aware `window.title`. Written to the worktree's `.vscode/settings.json` and merged into any existing settings without dropping your keys or comments.
- A **branch statusline** is written to `.claude/settings.local.json` so each Claude Code session shows its branch.

Both files are kept out of `git status` automatically — `skip-worktree` when the file is tracked, the worktree's local `info/exclude` otherwise. Your shared `.gitignore` is never touched.

Toggle either feature (both on by default):

```bash
gwt config theme off        # disable color + window title
gwt config statusline off   # disable the Claude statusline
```

## Worktree location

Worktrees are created as siblings of your repo directory:

```
~/projects/
  myrepo/           ← main repo
  myrepo-my-feature ← worktree created by gwt
```

## Supported IDEs

VS Code, Cursor, Zed, WebStorm, IntelliJ IDEA, PyCharm, GoLand, Vim, Neovim, Sublime Text — or any custom IDE via the "Other" option in the wizard.

## Requirements

- Node.js >= 18
- Git >= 2.5

## License

MIT
