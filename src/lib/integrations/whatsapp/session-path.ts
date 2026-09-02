import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join } from "path";

const SESSION_DIR = join(process.cwd(), ".data", "whatsapp-session");

export function ensureWhatsAppSessionDir(): void {
  mkdirSync(SESSION_DIR, { recursive: true });
}

export function getWhatsAppSessionDir(): string {
  ensureWhatsAppSessionDir();
  return SESSION_DIR;
}

export function hasWhatsAppSession(): boolean {
  ensureWhatsAppSessionDir();
  try {
    const files = readdirSync(SESSION_DIR);
    return files.some((name) => name.startsWith("creds"));
  } catch {
    return false;
  }
}

export function clearWhatsAppSession(): void {
  if (existsSync(SESSION_DIR)) {
    rmSync(SESSION_DIR, { recursive: true, force: true });
  }
}

export function isWhatsAppEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED !== "false";
}
