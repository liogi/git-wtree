import { intro, outro, log } from "@clack/prompts";
import pc from "picocolors";
import { readConfig, updateConfig } from "../lib/config.js";
import { runIdeWizard } from "../lib/ide.js";
import {
  readRepoConfigState,
  resolveConfig,
  writeRepoConfig,
  REPO_CONFIG_FILE,
  type RepoConfigState,
} from "../lib/repoConfig.js";

export async function commandConfigIde(): Promise<void> {
  intro("gwt config ide");
  await runIdeWizard();
  outro("Config saved");
}

// scanDirs / setup / teardown describe the project, so they are written to the
// repo's .gitwtree.json rather than to the global file. Requires being in a repo.
function requireRepo(): RepoConfigState {
  const state = readRepoConfigState();
  if (!state.repoRoot) {
    log.error(
      `Not inside a git repository — ${REPO_CONFIG_FILE} is per-project.`,
    );
    process.exit(1);
  }
  if (state.parseError) {
    log.error(`${REPO_CONFIG_FILE} is invalid: ${state.parseError}`);
    process.exit(1);
  }
  return state;
}

function tag(origin: "repo" | "global" | "default"): string {
  const label = { repo: REPO_CONFIG_FILE, global: "global", default: "default" }[
    origin
  ];
  return pc.dim(`[${label}]`);
}

export function commandConfigScanDirs(dirs?: string, reset?: boolean): void {
  const state = requireRepo();

  if (reset) {
    writeRepoConfig(state, { scanDirs: undefined });
    log.success(`scan-dirs cleared from ${REPO_CONFIG_FILE} (auto scan)`);
    return;
  }

  if (!dirs) {
    const { scanDirs, origin } = resolveConfig(state);
    const value = scanDirs?.length
      ? scanDirs.join(", ")
      : "auto (recursive scan)";
    console.log(`scan-dirs: ${value} ${tag(origin.scanDirs)}`);
    return;
  }

  const parsed = dirs
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  writeRepoConfig(state, { scanDirs: parsed });
  log.success(`scan-dirs set to: ${parsed.join(", ")} (${REPO_CONFIG_FILE})`);
}

function parseToggle(value: string): boolean | undefined {
  if (value === "on" || value === "true") return true;
  if (value === "off" || value === "false") return false;
  return undefined;
}

export function commandConfigTheme(value?: string): void {
  const config = readConfig();
  if (value === undefined) {
    console.log(`theme: ${config.theme === false ? "off" : "on"}`);
    return;
  }
  const parsed = parseToggle(value);
  if (parsed === undefined) {
    log.error("Value must be 'on' or 'off'");
    process.exit(1);
  }
  updateConfig({ theme: parsed });
  log.success(`theme ${parsed ? "enabled" : "disabled"}`);
}

export function commandConfigStatusline(value?: string): void {
  const config = readConfig();
  if (value === undefined) {
    console.log(`statusline: ${config.statusline === false ? "off" : "on"}`);
    return;
  }
  const parsed = parseToggle(value);
  if (parsed === undefined) {
    log.error("Value must be 'on' or 'off'");
    process.exit(1);
  }
  updateConfig({ statusline: parsed });
  log.success(`statusline ${parsed ? "enabled" : "disabled"}`);
}

function describeCommands(value: string[] | "auto" | undefined): string {
  if (value === "auto" || value === undefined) return "auto";
  if (value.length === 0) return "none";
  return value.join(" && ");
}

export function commandConfigSetup(values: string[]): void {
  const state = requireRepo();

  if (values.length === 0) {
    const { setup, origin, withheld } = resolveConfig(state);
    console.log(`setup: ${describeCommands(setup)} ${tag(origin.setup)}`);
    if (withheld) {
      console.log(
        pc.yellow(`  ${REPO_CONFIG_FILE} is untrusted — run \`gwt trust\``),
      );
    }
    return;
  }

  if (values.length === 1 && values[0] === "auto") {
    writeRepoConfig(state, { setup: "auto" });
    log.success(`setup reset to auto (${REPO_CONFIG_FILE})`);
    return;
  }
  if (values.length === 1 && values[0] === "none") {
    writeRepoConfig(state, { setup: [] });
    log.success(`setup disabled (${REPO_CONFIG_FILE})`);
    return;
  }
  writeRepoConfig(state, { setup: values });
  log.success(`setup set to: ${values.join(" && ")} (${REPO_CONFIG_FILE})`);
}

export function commandConfigTeardown(values: string[]): void {
  const state = requireRepo();

  if (values.length === 0) {
    const { teardown, origin, withheld } = resolveConfig(state);
    console.log(
      `teardown: ${teardown.length ? teardown.join(" && ") : "none"} ${tag(origin.teardown)}`,
    );
    if (withheld) {
      console.log(
        pc.yellow(`  ${REPO_CONFIG_FILE} is untrusted — run \`gwt trust\``),
      );
    }
    return;
  }

  if (values.length === 1 && values[0] === "none") {
    writeRepoConfig(state, { teardown: [] });
    log.success(`teardown disabled (${REPO_CONFIG_FILE})`);
    return;
  }
  writeRepoConfig(state, { teardown: values });
  log.success(`teardown set to: ${values.join(" && ")} (${REPO_CONFIG_FILE})`);
}

export function commandConfigShow(): void {
  const global = readConfig();
  const state = readRepoConfigState();
  const project = resolveConfig(state);

  console.log(pc.bold("\nGlobal") + pc.dim("  ~/.config/git-wtree/config.json"));
  console.log(`  ide:         ${global.ide ?? pc.dim("(not configured)")}`);
  console.log(`  theme:       ${global.theme === false ? "off" : "on"}`);
  console.log(`  statusline:  ${global.statusline === false ? "off" : "on"}`);

  if (!state.repoRoot) {
    console.log(pc.dim("\n(not inside a git repository — no project config)\n"));
    return;
  }

  const trust = !state.file
    ? pc.dim("(no file)")
    : state.parseError
      ? pc.red("invalid")
      : !state.hasExecutableKeys
        ? pc.dim("no commands — no approval needed")
        : state.trusted
          ? pc.green("trusted")
          : pc.yellow("UNTRUSTED — run `gwt trust`");

  console.log(
    pc.bold("\nProject") + pc.dim(`  ${state.filePath}`) + `  ${trust}`,
  );
  console.log(
    `  scan-dirs:   ${project.scanDirs?.length ? project.scanDirs.join(", ") : "auto"} ${tag(project.origin.scanDirs)}`,
  );
  console.log(
    `  setup:       ${describeCommands(project.setup)} ${tag(project.origin.setup)}`,
  );
  console.log(
    `  teardown:    ${project.teardown.length ? project.teardown.join(" && ") : "none"} ${tag(project.origin.teardown)}`,
  );
  console.log("");
}
