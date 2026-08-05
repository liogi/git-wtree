# Worktree theming pins VS Code's Modern UI experiment off

**Status:** accepted

`writeVscodeTheme` writes `"workbench.experimental.modernUI": false` into every worktree's
`.vscode/settings.json`, next to the colors it already writes.

## Why

VS Code's Modern UI experiment switches the workbench to a `floating-panels` layout whose stylesheet
contains:

```css
.monaco-workbench.floating-panels .part.statusbar,
.monaco-workbench.floating-panels .part.titlebar {
  background-color: transparent !important;
}
.floating-panels .part.sidebar,
.floating-panels .part.auxiliarybar {
  background-color: var(--vscode-sideBar-background) !important;
}
```

`!important` beats the CSS variables that carry `workbench.colorCustomizations`, so the title bar and
activity bar colors this tool exists to provide are silently dropped — the settings file is valid, the
configuration value is correct, nothing is logged. Upstream:
[microsoft/vscode#326126](https://github.com/microsoft/vscode/issues/326126).

The experiment ships as a **staged rollout** (`experiment: { mode: "auto" }`), so it switches on without
the user changing a setting, and "it isn't in my settings" never means "it isn't active". The failure
therefore arrives out of nowhere, on a VS Code update, and reads as a bug in `gwt`. Diagnosing it cost a
full session: the file is right, the value is right, and only the rendering is wrong.

The setting has no `scope` in its schema, so it defaults to `WINDOW` — settable per workspace. An
explicit value beats an experiment assignment, so one key in the worktree's own settings restores the
colors without touching the user's global configuration.

## Considered options

- **Warn in `gwt doctor` instead.** Rejected as the only measure: a binary cannot reliably read the
  experiment assignment (it lives in VS Code's `state.vscdb`), so the check would be guesswork, and it
  leaves the tool's core feature broken by default.
- **Write the key to the user's global settings.** Rejected: hijacks configuration the user owns, for
  every window including repos that have nothing to do with worktrees.
- **Do nothing, wait for the upstream fix.** Rejected: the per-worktree color is the whole point of the
  feature, and the rollout is live now.

## Consequences

- Worktrees created by `gwt` opt out of Modern UI. Anyone who **wants** Modern UI there has to remove the
  key, or run `gwt config theme off` to stop `gwt` writing theming at all.
- The key lands in the same file as the colors, so it inherits `hideFromGit` — it never shows up in
  `git status` and never reaches a shared commit.
- `gwt open` re-applies the theme, so worktrees created before this change (or with a bare
  `git worktree add`) pick the key up on next open.
- This is a workaround for an upstream bug. When #326126 is fixed, drop the key rather than carrying it
  forever — pinning users out of a shipped UI is not a long-term position.
