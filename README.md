# wtree

> Git worktree manager with .env syncing and IDE integration

Streamline your git worktree workflow: create isolated branches, sync environment files, install dependencies, and open your IDE — all in one command.

## Install

```bash
npm install -g @liogi/wtree
```

## Usage

```bash
wtree <command>
# or
wt <command>
```

### Commands

| Command                         | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `wtree add <branch>`            | Create a worktree, sync `.env` files, and install dependencies |
| `wtree rm <branch>`             | Remove a worktree                                              |
| `wtree ls`                      | List all worktrees                                             |
| `wtree open <branch>`           | Open a worktree in your IDE                                    |
| `wtree config`                  | Show current configuration                                     |
| `wtree config ide`              | Configure your IDE                                             |
| `wtree config scan-dirs [dirs]` | Set directories to scan for `.env` files                       |
| `wtree help`                    | Show help                                                      |

### `wtree add <branch>`

Creates a git worktree for the given branch (creates the branch from `HEAD` if it doesn't exist), copies `.env` files from the main repo, and runs the package manager install.

```bash
wtree add my-feature
# Worktree created at ../myrepo-my-feature
```

### `wtree open <branch>`

Opens the worktree in your configured IDE. On first use, a wizard will prompt you to choose your IDE.

```bash
wtree open my-feature
```

To reconfigure your IDE at any time:

```bash
wtree config ide
```

### `.env` syncing

By default, `wtree add` recursively scans the repo for `.env*` files (excluding `node_modules`, `.git`, `dist`, etc.) and copies them into the new worktree.

To restrict scanning to specific directories:

```bash
wtree config scan-dirs apps/api,apps/web
```

To reset back to auto scan:

```bash
wtree config scan-dirs --reset
```

## Worktree location

Worktrees are created as siblings of your repo directory:

```
~/projects/
  myrepo/           ← main repo
  myrepo-my-feature ← worktree created by wtree
```

## Supported IDEs

VS Code, Cursor, Zed, WebStorm, IntelliJ IDEA, PyCharm, GoLand, Vim, Neovim, Sublime Text — or any custom IDE via the "Other" option in the wizard.

## Requirements

- Node.js >= 18
- Git >= 2.5

## License

MIT
