// zsh / bash function. `gwt switch` lets the binary render its picker on the
// terminal and hands the chosen path back through a temp file, then cd's into it
// (a binary can't change the parent shell's cwd on its own).
//
// The leading `unalias` clears oh-my-zsh's git-plugin aliases (gwt → git worktree)
// so the function can define cleanly and win over them; harmless otherwise. The
// function body is wrapped in an inner `eval` so it is parsed only AFTER the
// unalias runs — zsh expands aliases at parse time, and a single outer eval would
// parse the whole block (alias still active) before the unalias executes.
// (Body uses only double quotes, so single-quoting it here is safe.)
const POSIX = `unalias gwt gwta gwtls gwtmv gwtrm 2>/dev/null
eval 'gwt() {
  case "$1" in
    switch|sw)
      local _gwt_out _gwt_dir
      _gwt_out="$(mktemp)" || return
      command gitwtree path --out "$_gwt_out" "\${@:2}"
      _gwt_dir="$(cat "$_gwt_out" 2>/dev/null)"
      rm -f "$_gwt_out"
      [ -n "$_gwt_dir" ] && cd "$_gwt_dir"
      ;;
    *)
      command gitwtree "$@"
      ;;
  esac
}'`;

const FISH = `function gwt
  if test "$argv[1]" = switch -o "$argv[1]" = sw
    set -l _gwt_out (mktemp)
    command gitwtree path --out "$_gwt_out" $argv[2..-1]
    set -l _gwt_dir (cat "$_gwt_out" 2>/dev/null)
    rm -f "$_gwt_out"
    test -n "$_gwt_dir"; and cd "$_gwt_dir"
  else
    command gitwtree $argv
  end
end`;

export function commandShellInit(shell?: string): void {
  const target = (shell ?? "zsh").toLowerCase();
  process.stdout.write((target === "fish" ? FISH : POSIX) + "\n");
}
