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

### Commands

| Command                             | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `gwt add <branch> [--from <base>]`  | Create a worktree, sync `.env` files, and run the setup hook |
| `gwt rm <branch> [--force]`         | Remove a worktree (guards against unsaved changes)           |
| `gwt ls`                            | List all worktrees                                           |
| `gwt open <branch>`                 | Open a worktree in your IDE                                  |
| `gwt switch [query]`                | `cd` to another worktree (needs the shell wrapper)           |
| `gwt shell-init [shell]`            | Print the shell function enabling `gwt switch`               |
| `gwt config`                        | Show current configuration                                   |
| `gwt config ide`                    | Configure your IDE                                           |
| `gwt config scan-dirs [dirs]`       | Set directories to scan for `.env` files                     |
| `gwt config setup [commands...]`    | Post-create commands (`auto` / `none` / custom)              |
| `gwt config teardown [commands...]` | Pre-remove commands run in the worktree (`none` to clear)    |
| `gwt config theme [on\|off]`        | Toggle per-worktree VS Code color + window title             |
| `gwt config statusline [on\|off]`   | Toggle the Claude Code branch statusline                     |
| `gwt help`                          | Show help                                                    |

### `gwt add <branch>`

Creates a git worktree for the given branch, copies `.env` files from the main repo, and runs the [setup hook](#setup--teardown-hooks).

- If the branch **doesn't exist**, it's created from `HEAD` by default — use `--from` to specify a different base.
- If the branch **already exists locally**, it fetches the latest remote changes and resets to them (handles force-pushes cleanly).

```bash
gwt add my-feature                     # create from HEAD
gwt add my-feature --from production   # create from production
gwt add codex/fix-bug                  # checkout existing branch, reset to remote
```

### `gwt open <branch>`

Opens the worktree in your configured IDE. On first use, a wizard will prompt you to choose your IDE.

```bash
gwt open my-feature
```

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
