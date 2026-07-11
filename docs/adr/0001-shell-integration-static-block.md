# Shell integration writes a static, expanded block via `--install`

**Status:** accepted

`gwt` needs a shell function — to win over oh-my-zsh's `gwt` git-plugin alias, and to let `switch` change the shell's cwd (a binary can't change its parent shell's directory). The ecosystem-standard way is `eval "$(gitwtree shell-init <shell>)"` in the rc. We deliberately do **not** recommend that form. Instead, `gitwtree shell-init --install` writes the **already-expanded** wrapper as a static, marker-delimited block at the end of the shell rc.

## Why

`eval "$(gitwtree shell-init …)"` runs `gitwtree` at shell-startup. If that line sits before the PATH that exposes `gitwtree` — common with nvm/fnm lazy-load setups, where npm-global bins are added to PATH later in the rc — startup fails with `command not found: gitwtree`, the function is never defined, and `gwt` silently falls back to the oh-my-zsh alias (`git worktree`). The expanded block never calls `gitwtree` at startup; the only call is at run-time inside the function body (`command gitwtree "$@"`). So it is robust to any PATH ordering.

Verified empirically: with `gitwtree` off the PATH at source-time, the `eval` form leaves `gwt` an alias, the static block leaves it a function.

## Considered options

- **`eval "$(gitwtree shell-init <shell>)"`** (the convention, e.g. zoxide/direnv). Rejected: source-time dependency on `gitwtree` being on PATH → the failure above.
- **Lazy self-replacing shim** — a thin function that regenerates the real wrapper from the binary on first call. Rejected: robust and auto-updating, but adds indirection/magic against the tool's "light and simple" goal, for a wrapper that almost never changes.

## Consequences

- The wrapper is frozen in the rc at install time. It changes only when a new shell-side command (like `switch`) is added — never for plain subcommands, which flow through `command gitwtree "$@"`. Updating means re-running `gitwtree shell-init --install`, which rewrites the marker-delimited block in place. A version tag in the marker (`# >>> git-wtree vX >>>`) makes staleness visible.
- The block is delimited by markers, so `--install` is idempotent (detect / replace / skip) and `--uninstall` removes it cleanly.
- `bash` on macOS: Terminal launches a login shell reading `~/.bash_profile`, not `~/.bashrc`. `--install` targets `~/.bashrc` and warns rather than editing a second file. `--rc <path>` is the escape hatch.
