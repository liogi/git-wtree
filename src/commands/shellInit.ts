// zsh / bash function. `gwt switch` resolves a path via the binary, then cd's
// into it (a binary can't change the parent shell's cwd on its own).
const POSIX = `gwt() {
  case "$1" in
    switch|sw)
      local _gwt_dir
      _gwt_dir="$(command gitwtree path "\${@:2}")" || return
      [ -n "$_gwt_dir" ] && cd "$_gwt_dir"
      ;;
    *)
      command gitwtree "$@"
      ;;
  esac
}`;

const FISH = `function gwt
  if test "$argv[1]" = switch -o "$argv[1]" = sw
    set -l _gwt_dir (command gitwtree path $argv[2..-1]); or return
    test -n "$_gwt_dir"; and cd "$_gwt_dir"
  else
    command gitwtree $argv
  end
end`;

export function commandShellInit(shell?: string): void {
  const target = (shell ?? "zsh").toLowerCase();
  process.stdout.write((target === "fish" ? FISH : POSIX) + "\n");
}
