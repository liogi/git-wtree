# Changelog

## 0.8.3

Nothing to reinstall — the shell wrapper is unchanged.

### Changed

- **The README leads with what the tool does.** The first three sections used to
  be shell-integration setup — oh-my-zsh alias conflicts and PATH ordering — and
  per-worktree colour, the thing no other worktree tool does, sat at line 372 of
  466 with no picture. Pitch and screenshot now come first, install and usage
  next, shell integration once you know why you want it, and the release
  procedure at the end where a user of the package can ignore it. Nothing was
  dropped; the warning that `gwt` needs the shell integration is still in
  `Usage`, in six lines instead of a section at the door.

### Fixed

- **Some worktree colours barely looked coloured.** Every colour has to be dark
  enough for white text to stay readable, and VS Code's default chrome is dark
  too, so the two could drift close: the dullest, darkest quarter of the palette
  sat ΔE 22 from an unthemed window. That combination is gone. The worst case is
  now 27, and telling worktrees apart from each other is unaffected — collisions
  among four stay at seven percent.

  Existing worktrees change colour the next time `gwt add` or `gwt open` themes
  them.

### Internal

- A `.DS_Store` slipped into the repository with the palette fix and is now
  removed and gitignored. It never reached the package — `files` in
  package.json only ever carried `dist`, `CHANGELOG.md`, `LICENSE` and
  `README.md`.

## 0.8.2

Nothing to reinstall — the shell wrapper is unchanged.

### Fixed

- **Sibling branches got indistinguishable colours.** `feature-a` and
  `feature-b` landed 1° apart on the hue wheel — the same colour, to a human —
  and so did `fix-1`/`fix-2`, `pr-101`/`pr-102`, and every other pair differing
  in a trailing character. The hash advanced by one for an input that advanced
  by one, and the low bits went straight into the hue. It now runs through an
  avalanche step, so those pairs sit 85–180° apart.

- **Colours are drawn from four wheels instead of one.** Hue alone gives 360
  places to stand and branch names land on them at random, so with four
  worktrees open two were perceptually identical about one time in five —
  the birthday problem rather than any flaw. Lightness and saturation now vary
  too, which drops that to roughly one in fourteen. White text stays above
  WCAG AA throughout, measured at 4.53:1 in the worst case.

  It narrows the odds rather than closing them. Closing them would mean
  coordinating colours across worktrees instead of deriving them from a name,
  which costs determinism — the same branch would look different on another
  machine — and breaks under two concurrent `gwt add`, a real scenario when
  agents run in parallel. Not worth it for the remaining seven percent; rename
  a branch if two ever clash.

### Internal

- A `/release` skill in `.claude/skills/` prepares releases: it bumps the
  version, writes the changelog entry from the pull requests merged since the
  last tag, and stops before tagging. Repository tooling — not part of the
  published package.

## 0.8.1

Nothing to reinstall — the shell wrapper is unchanged.

### Fixed

- **`gwt add` and `gwt pr` no longer depend on where you run them.** Both took
  "the repository" to mean the worktree you happened to be standing in, so from a
  secondary worktree they created `repo-other-feature` — a worktree named after
  another worktree — and copied `.env` files from a directory that may hold none.
  Run from a worktree made with a bare `git worktree add`, that meant a new
  worktree with no `.env` at all and only "No .env files found to copy" to explain
  it. Both now resolve the main worktree, the same rule `gwt sync-env` already
  documented.

- `npm pkg fix`: normalised the `bin` paths npm was correcting at publish time,
  and unescaped the author name. No change to what is installed.

## 0.8.0

The release that turned a working tool into a maintained one: two security
fixes, a guard against silent data loss, a test suite, and two new commands.

### ⚠️ Upgrading

**Node 22.12 or newer is now required** (`commander@15` sets that floor; Node 18
and 20 are both end of life).

**Run `gitwtree shell-init --install` once after upgrading.** The rc block
changed shape — it is now a two-line loader that never changes again, so this is
the last time an upgrade will ask. `gwt doctor` will tell you if you skip it.

### Fixed — security

- **A branch name could execute shell commands.** Every `git` call built a
  command string for a shell, and git refnames legitimately allow `"`, `$`,
  backticks and `;`. Reachable through `gwt pr`, which exists to check out
  branches named by people you do not control: `gwt rm` then fed that name to
  `git branch -D`. All git and gh invocations now pass argument arrays, so a
  branch name is data and cannot become code. `gwt open` had the same hole via
  the worktree directory name, fixed by quoting the IDE command properly.

- **`.gitwtree.json` runs commands, so it now needs approval.** Project config
  moved into the repo, where `setup` and `teardown` would otherwise let any
  cloned repository run commands on your machine. The file is read from the main
  worktree — never from the one being created, so a fork's copy is never
  consulted — and its commands run only after `gwt trust`, which prints them and
  records a hash. Any edit revokes approval. `scanDirs` is inert data and needs
  none.

### Fixed — data loss

- **`gwt add` discarded unpushed commits without asking.** Resetting an existing
  branch to its remote is what makes an upstream force-push land cleanly; it also
  threw away commits the branch had and the remote did not, silently. It now
  lists them and defaults to keeping them, resets untouched when the branch is
  level or behind, and `--force` resets anyway while pointing at `git reflog`.

### Added

- **`gwt prune`** — removes worktrees whose branch has landed. Dry run by
  default like `sync-env`, same dirty guard as `rm`. A branch counts as finished
  when it is an ancestor of the base **or** its pull request is merged, because
  squash merges leave no trace in the base's history. A branch never committed to
  is kept, not pruned: `prune` is for finished work, not unstarted work.

- **`gwt ls` reports state** — uncommitted changes, ahead/behind, and age, next
  to each worktree. `no upstream` marks the branch `gwt rm` will refuse.

- **`--open` on `gwt add` and `gwt pr`** — the README promised this and the code
  never did it. Opt-in, because a window on every worktree you create is not
  always wanted.

- **`gwt trust`** — approve, or `--revoke`, a repo's `.gitwtree.json`.

- **`gwt rm` and `gwt prune` put you back where you can work.** Removing the
  worktree you are standing in left the shell in a directory that no longer
  exists, with nothing working until you moved yourself. (Plain
  `git worktree remove` leaves you there too.) They now return you to the main
  worktree, or say exactly which `cd` to run when the shell integration is not
  active.

- **Per-project configuration in `.gitwtree.json`.** `scanDirs`, `setup` and
  `teardown` describe the project, not you, and lived in a single global file
  where the second repo overwrote the first. `ide`, `theme` and `statusline` stay
  global. `gwt config` tags every value with where it resolved from. Legacy
  global keys are still read as a fallback, so nothing breaks on upgrade.

### Changed

- **`gwt ls` says `(primary)` where it said `(main)`.** On the main worktree with
  a feature branch checked out, `feature/x (main)` read as a contradiction. The
  label describes the worktree, not the branch, and no longer borrows a word
  branches already use. Not `(root)` — that is the repository root, a different
  thing once worktrees exist.

- **The shell wrapper lost its special case.** `switch` was hard-coded into it;
  it is a plain subcommand now. Every invocation gets a `GWT_CD_FILE`, and any
  command that needs to move your shell writes to it — so the wrapper never has
  to learn a new one.

### Fixed — everything else

- `gwt doctor` can finally answer the question it used to hand back: whether
  `gwt` is the shell function or oh-my-zsh's alias. The wrapper exports its
  revision, and doctor reports the rc, the wrapper file and this shell
  separately, because they fail independently.
- `gwt rm` and `gwt open` crashed with a raw `uv_tty_init returned EINVAL` in any
  non-interactive context. Both now degrade to a clear message.
- `(main)` marked the worktree you were standing in rather than the main one, so
  `gwt ls` mislabelled it and `gwt rm` refused to remove a secondary worktree.
- Removing the worktree you are standing in reported `spawnSync git ENOENT`
  after succeeding, leaving git's registry un-pruned.
- `shell-init --install` stacked a second block when the rc held a truncated one,
  which made `doctor` report a stale version forever.

### Internal

- **149 tests**, `node:test`, no test runner dependency and no separate compile
  step. CI runs them on Node 22 and 24.
- Dependencies: `commander` 12 → 15, `@clack/prompts` 0.9 → 1, `@types/node`
  22 → 26. TypeScript stays on 5.9 deliberately — 7.0 is the Go rewrite and
  `renovate.json` holds compiler majors for 90 days.
- Renovate, with a 14-day hold on every update.

## 0.7.0 and earlier

See the commit history.
