import { intro, outro, log } from "@clack/prompts";
import { readConfig, updateConfig } from "../lib/config.js";
import { runIdeWizard } from "../lib/ide.js";

export async function commandConfigIde(): Promise<void> {
  intro("wtree config ide");
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

export function commandConfigShow(): void {
  const config = readConfig();
  console.log(JSON.stringify(config, null, 2));
}
