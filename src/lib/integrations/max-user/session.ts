import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

export const MAX_USER_SESSION_NAME = "hubdesk";

const DATA_DIR = join(process.cwd(), ".data", "max-sessions");
const DATA_FILE = join(DATA_DIR, `${MAX_USER_SESSION_NAME}.json`);
const WMS_DIR = join(process.cwd(), "sessions");
const WMS_FILE = join(WMS_DIR, `${MAX_USER_SESSION_NAME}.json`);

export function getMaxUserSessionDataPath(): string {
  return DATA_FILE;
}

export function syncMaxUserSessionToWebmaxsocket(): void {
  mkdirSync(WMS_DIR, { recursive: true });
  if (existsSync(DATA_FILE)) {
    copyFileSync(DATA_FILE, WMS_FILE);
  }
}

export function persistMaxUserSessionFromWebmaxsocket(): void {
  if (!existsSync(WMS_FILE)) return;
  mkdirSync(DATA_DIR, { recursive: true });
  copyFileSync(WMS_FILE, DATA_FILE);
}

export function hasMaxUserSession(): boolean {
  if (existsSync(DATA_FILE)) {
    try {
      const raw = readFileSync(DATA_FILE, "utf-8").trim();
      if (!raw) return false;
      const data = JSON.parse(raw) as { token?: string };
      return Boolean(data.token);
    } catch {
      return false;
    }
  }
  return Boolean(process.env.MAX_USER_TOKEN?.trim());
}

export function writeMaxUserSessionFromToken(token: string): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const payload = {
    token: token.trim(),
    deviceType: "ANDROID",
  };
  writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
  syncMaxUserSessionToWebmaxsocket();
}

export function clearMaxUserSession(): void {
  if (existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, "{}", "utf-8");
  }
  if (existsSync(WMS_FILE)) {
    try {
      unlinkSync(WMS_FILE);
    } catch {
      // ignore
    }
  }
}

export function ensureMaxUserSessionDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(WMS_DIR, { recursive: true });
}

export function bootstrapMaxUserSessionFromEnv(): void {
  const token = process.env.MAX_USER_TOKEN?.trim();
  if (!token || hasMaxUserSession()) return;
  writeMaxUserSessionFromToken(token);
}
