import fs from "fs";

/**
 * Asks the shell wrapper to change directory once this command exits.
 *
 * A binary cannot change its parent shell's cwd. The wrapper creates a temp file,
 * points GWT_CD_FILE at it, and cd's to whatever it finds there afterwards — the
 * same trick `gwt switch` always used, lifted out of the wrapper's special case
 * so that any command can use it and the wrapper never has to learn a new one.
 *
 * Returns false when the integration is not active, so callers can say something
 * useful instead of silently doing nothing.
 */
export function requestCd(target: string): boolean {
  const file = process.env.GWT_CD_FILE;
  if (!file) return false;
  try {
    fs.writeFileSync(file, target);
    return true;
  } catch {
    return false;
  }
}
