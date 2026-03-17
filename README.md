# git-wtree

> Git worktree manager with .env syncing and IDE integration

Streamline your git worktree workflow: create isolated branches, sync environment files, install dependencies, and open your IDE — all in one command.

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

| Command                       | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `gwt add <branch>`            | Create a worktree, sync `.env` files, and install dependencies |
| `gwt rm <branch>`             | Remove a worktree                                              |
| `gwt ls`                      | List all worktrees                                             |
| `gwt open <branch>`           | Open a worktree in your IDE                                    |
| `gwt config`                  | Show current configuration                                     |
| `gwt config ide`              | Configure your IDE                                             |
| `gwt config scan-dirs [dirs]` | Set directories to scan for `.env` files                       |
| `gwt help`                    | Show help                                                      |

### `gwt add <branch>`

Creates a git worktree for the given branch (creates the branch from `HEAD` if it doesn't exist), copies `.env` files from the main repo, and runs the package manager install.

```bash
gwt add my-feature
# Worktree created at ../myrepo-my-feature
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
