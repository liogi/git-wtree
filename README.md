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

| Command                            | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| `gwt add <branch> [--from <base>]` | Create a worktree, sync `.env` files, and install dependencies |
| `gwt rm <branch>`                  | Remove a worktree                                              |
| `gwt ls`                           | List all worktrees                                             |
| `gwt open <branch>`                | Open a worktree in your IDE                                    |
| `gwt config`                       | Show current configuration                                     |
| `gwt config ide`                   | Configure your IDE                                             |
| `gwt config scan-dirs [dirs]`      | Set directories to scan for `.env` files                       |
| `gwt config theme [on\|off]`       | Toggle per-worktree VS Code color + window title               |
| `gwt config statusline [on\|off]`  | Toggle the Claude Code branch statusline                       |
| `gwt help`                         | Show help                                                      |

### `gwt add <branch>`

Creates a git worktree for the given branch, copies `.env` files from the main repo, and runs the package manager install.

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
