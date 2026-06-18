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

export function commandConfigShow(): void {
  const config = readConfig();
  const resolved = {
    ...config,
    theme: config.theme !== false,
    statusline: config.statusline !== false,
  };
  console.log(JSON.stringify(resolved, null, 2));
}
