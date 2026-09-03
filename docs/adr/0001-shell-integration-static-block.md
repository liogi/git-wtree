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

## Amendment 2: the rc holds a loader, the wrapper lives in a file (accepted later)

Both earlier decisions stand — never run the binary at shell startup, and let the block report
itself — but writing the wrapper *inline* in the rc was the wrong way to satisfy the first.

The rc now holds three lines that never change:

```sh
# >>> git-wtree >>>
[ -r "$HOME/.config/git-wtree/init.zsh" ] && . "$HOME/.config/git-wtree/init.zsh"
# <<< git-wtree <<<
```

This is the shape nvm, bun and SDKMAN use. It sources a static file at a fixed path, so it still
runs nothing at startup and is still immune to PATH ordering — the property this ADR exists to
protect.

### Why the inline form had to go

The block carried the package version, so **every release changed it**. `doctor` compared that
version to the binary's and reported the integration as stale after any bump, including patches
that touched nothing shell-side, and told users to reinstall a wrapper that had not changed.
The advice was noise, and noise trains people to ignore warnings that later matter.

Three further consequences fell out of the split:

- The wrapper is identified by a **hash of its own content**, not by the package version, so it
  changes only when the wrapper changes. A hash cannot be forgotten the way a hand-bumped counter
  can.
- Any `gitwtree` invocation rewrites an out-of-date wrapper, so `npm i -g git-wtree@latest` is the
  whole upgrade: the next terminal has the new wrapper. `doctor` then says *open a new terminal*
  rather than *reinstall*, which is both true and actionable.
- The nested `eval` is gone. It existed because zsh expands aliases at parse time and an inline
  block was parsed as one unit, so the `unalias` had to be forced to run first. A **sourced file**
  executes command by command, so the unalias simply runs before the function below it is parsed.
  Verified, not assumed.

### Consequences

- Two artefacts instead of one; `--uninstall` removes both.
- `~/.config/git-wtree/init.<shell>`, not the npm package directory: a global npm prefix moves when
  you switch Node versions with nvm or fnm, and the rc line needs a path that does not.
- Deleting `~/.config/git-wtree` leaves the rc line silently doing nothing. `doctor` reports the
  wrapper as missing.
- One last reinstall to move to the new format. It is the last one that will be needed for a
  version bump.

## Amendment: the block reports itself (accepted later)

This ADR left `doctor` unable to answer the question users actually hit — is `gwt` the function,
or still oh-my-zsh's alias? — on the grounds that a binary cannot inspect its parent shell. That is
true, and it framed the problem the wrong way round: the block runs *inside* that shell, and can
leave a mark that every child process inherits.

The block now exports `GWT_SHELL_INTEGRATION=<version>`. Its presence means the block was sourced,
and the block is what clears the aliases and defines the function, so presence implies `gwt` is the
function. `doctor` reports rc-file state and in-shell state separately, because "installed" and
"active" fail independently and look identical from outside.

Consequence: the block content changed, so anyone who installed an earlier version must re-run
`gitwtree shell-init --install`. `doctor` says so.
