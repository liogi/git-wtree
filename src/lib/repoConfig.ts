import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { getMainWorktree } from "./git.js";
import { readConfig } from "./config.js";

export const REPO_CONFIG_FILE = ".gitwtree.json";

const TRUST_PATH = path.join(
  os.homedir(),
  ".config",
  "git-wtree",
  "trust.json",
);

// Settings that belong to the project rather than to you. Anything here can be
// committed and shared; `ide`, `theme` and `statusline` stay in the global config
// because they describe the developer, not the repo.
export interface RepoFileConfig {
  scanDirs?: string[] | null;
  setup?: string[] | "auto";
  teardown?: string[];
}

// `setup` and `teardown` are shell commands git-wtree runs on your machine. Every
// other key is inert data. Only these two require an explicit `gwt trust`.
const EXECUTABLE_KEYS = ["setup", "teardown"] as const;

export interface RepoConfigState {
  /** Absolute path of the main worktree, or null when not inside a repo. */
  repoRoot: string | null;
  /** Absolute path of .gitwtree.json, whether or not it exists. */
  filePath: string | null;
  /** Parsed contents, or null when the file is absent or unreadable. */
  file: RepoFileConfig | null;
  /** True when the file declares `setup` or `teardown`. */
  hasExecutableKeys: boolean;
  /** True when the file's current hash is recorded in the trust store. */
  trusted: boolean;
  /** Set when the file exists but could not be parsed. */
  parseError: string | null;
}

function readTrustStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(TRUST_PATH, "utf-8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function hashFile(filePath: string): string | null {
  try {
    return crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");
  } catch {
    return null;
  }
}

// The repo file is always read from the MAIN worktree, never from the worktree
// being created. `gwt pr` checks out branches from forks we do not control; if
// their .gitwtree.json were honoured, a fork could choose what runs on this
// machine. Reading main's copy also makes the config predictable — it does not
// change under you when you switch branches.
export function readRepoConfigState(): RepoConfigState {
  let repoRoot: string | null = null;
  try {
    repoRoot = getMainWorktree()?.path ?? null;
  } catch {
    repoRoot = null;
  }
  if (!repoRoot) {
    return {
      repoRoot: null,
      filePath: null,
      file: null,
      hasExecutableKeys: false,
      trusted: false,
      parseError: null,
    };
  }

  const filePath = path.join(repoRoot, REPO_CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    return {
      repoRoot,
      filePath,
      file: null,
      hasExecutableKeys: false,
      trusted: false,
      parseError: null,
    };
  }

  let file: RepoFileConfig | null = null;
  let parseError: string | null = null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      parseError = `${REPO_CONFIG_FILE} must contain a JSON object`;
    } else {
      file = parsed as RepoFileConfig;
    }
  } catch (e) {
    parseError = (e as Error).message;
  }

  const hasExecutableKeys =
    file !== null && EXECUTABLE_KEYS.some((k) => file[k] !== undefined);

  const hash = hashFile(filePath);
  const trusted = hash !== null && readTrustStore()[repoRoot] === hash;

  return { repoRoot, filePath, file, hasExecutableKeys, trusted, parseError };
}

// Records the file's current hash as trusted. Any later edit changes the hash and
// silently revokes trust, so a `git pull` that rewrites the commands re-prompts.
export function trustRepoConfig(state: RepoConfigState): void {
  if (!state.repoRoot || !state.filePath) return;
  const hash = hashFile(state.filePath);
  if (!hash) return;
  const store = readTrustStore();
  store[state.repoRoot] = hash;
  fs.mkdirSync(path.dirname(TRUST_PATH), { recursive: true });
  fs.writeFileSync(TRUST_PATH, JSON.stringify(store, null, 2));
}

export function revokeRepoConfigTrust(state: RepoConfigState): boolean {
  if (!state.repoRoot) return false;
  const store = readTrustStore();
  if (!(state.repoRoot in store)) return false;
  delete store[state.repoRoot];
  fs.writeFileSync(TRUST_PATH, JSON.stringify(store, null, 2));
  return true;
}

export interface EffectiveConfig {
  scanDirs?: string[] | null;
  setup?: string[] | "auto";
  teardown: string[];
  /** Where each resolved value came from — used by `gwt config show`. */
  origin: Record<"scanDirs" | "setup" | "teardown", "repo" | "global" | "default">;
  /** True when the repo file declares commands that trust is withholding. */
  withheld: boolean;
}

// Merge order: repo file wins over the legacy global keys, which win over the
// built-in defaults. Executable keys are dropped from an untrusted file, so an
// unapproved repo falls back to global/auto rather than running anything.
export function resolveConfig(state?: RepoConfigState): EffectiveConfig {
  const s = state ?? readRepoConfigState();
  const global = readConfig();
  const repo = s.file ?? {};

  const allowExec = s.trusted;
  const withheld = s.hasExecutableKeys && !allowExec;

  const origin: EffectiveConfig["origin"] = {
    scanDirs: "default",
    setup: "default",
    teardown: "default",
  };

  let scanDirs: string[] | null | undefined;
  if (repo.scanDirs !== undefined) {
    scanDirs = repo.scanDirs;
    origin.scanDirs = "repo";
  } else if (global.scanDirs !== undefined) {
    scanDirs = global.scanDirs;
    origin.scanDirs = "global";
  }

  let setup: string[] | "auto" | undefined;
  if (repo.setup !== undefined && allowExec) {
    setup = repo.setup;
    origin.setup = "repo";
  } else if (global.setup !== undefined) {
    setup = global.setup;
    origin.setup = "global";
  }

  let teardown: string[] = [];
  if (repo.teardown !== undefined && allowExec) {
    teardown = repo.teardown;
    origin.teardown = "repo";
  } else if (global.teardown !== undefined) {
    teardown = global.teardown;
    origin.teardown = "global";
  }

  return { scanDirs, setup, teardown, origin, withheld };
}

// Writes a patch into the repo's .gitwtree.json, creating it if needed, and
// re-trusts the result — you authored this change, so it needs no approval.
export function writeRepoConfig(
  state: RepoConfigState,
  patch: RepoFileConfig,
): void {
  if (!state.filePath) throw new Error("Not inside a git repository");
  const next: RepoFileConfig = { ...(state.file ?? {}), ...patch };
  for (const key of Object.keys(next) as (keyof RepoFileConfig)[]) {
    if (next[key] === undefined) delete next[key];
  }
  fs.writeFileSync(state.filePath, `${JSON.stringify(next, null, 2)}\n`);
  trustRepoConfig({ ...state, file: next });
}
