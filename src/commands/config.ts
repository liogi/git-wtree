import { intro, outro, log } from "@clack/prompts";
import { readConfig, updateConfig } from "../lib/config.js";
import { runIdeWizard } from "../lib/ide.js";

export async function commandConfigIde(): Promise<void> {
  intro("gwt config ide");
  await runIdeWizard();
  outro("Config saved");
}

export function commandConfigScanDirs(dirs?: string, reset?: boolean): void {
  if (reset) {
    updateConfig({ scanDirs: null });
    log.success("scan-dirs reset to auto (recursive scan)");
    return;
  }

  if (!dirs) {
    const config = readConfig();
    if (!config.scanDirs) {
      console.log("scan-dirs: auto (recursive scan)");
    } else {
      console.log(`scan-dirs: ${config.scanDirs.join(", ")}`);
    }
    return;
  }

  const parsed = dirs
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  updateConfig({ scanDirs: parsed });
  log.success(`scan-dirs set to: ${parsed.join(", ")}`);
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

export function commandConfigSetup(values: string[]): void {
  const config = readConfig();
  if (values.length === 0) {
    console.log(`setup: ${JSON.stringify(config.setup ?? "auto")}`);
    return;
  }
  if (values.length === 1 && values[0] === "auto") {
    updateConfig({ setup: "auto" });
    log.success("setup reset to auto");
    return;
  }
  if (values.length === 1 && values[0] === "none") {
    updateConfig({ setup: [] });
    log.success("setup disabled (no commands)");
    return;
  }
  updateConfig({ setup: values });
  log.success(`setup set to: ${values.join(" && ")}`);
}

export function commandConfigTeardown(values: string[]): void {
  const config = readConfig();
  if (values.length === 0) {
    console.log(`teardown: ${JSON.stringify(config.teardown ?? [])}`);
    return;
  }
  if (values.length === 1 && values[0] === "none") {
    updateConfig({ teardown: [] });
    log.success("teardown disabled (no commands)");
    return;
  }
  updateConfig({ teardown: values });
  log.success(`teardown set to: ${values.join(" && ")}`);
}

export function commandConfigShow(): void {
  const config = readConfig();
  const resolved = {
    ...config,
    theme: config.theme !== false,
    statusline: config.statusline !== false,
    setup: config.setup ?? "auto",
    teardown: config.teardown ?? [],
  };
  console.log(JSON.stringify(resolved, null, 2));
}
