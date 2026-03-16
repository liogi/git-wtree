import fs from "fs";
import path from "path";
import os from "os";

export interface WtreeConfig {
  ide?: string;
  ideCommand?: string;
  scanDirs?: string[] | null;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "wtree");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function readConfig(): WtreeConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as WtreeConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: WtreeConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function updateConfig(patch: Partial<WtreeConfig>): void {
  const current = readConfig();
  writeConfig({ ...current, ...patch });
}
