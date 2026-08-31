import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SESSION_DIR = join(process.cwd(), ".data");
const SESSION_FILE = join(SESSION_DIR, "telegram-session.txt");

export function readTelegramSession(): string {
  if (existsSync(SESSION_FILE)) {
    return readFileSync(SESSION_FILE, "utf-8").trim();
  }
  return process.env.TELEGRAM_SESSION?.trim() ?? "";
}

export function writeTelegramSession(session: string): void {
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, session, "utf-8");
}

export function clearTelegramSession(): void {
  if (existsSync(SESSION_FILE)) {
    writeFileSync(SESSION_FILE, "", "utf-8");
  }
}

export function hasTelegramSession(): boolean {
  return readTelegramSession().length > 0;
}
