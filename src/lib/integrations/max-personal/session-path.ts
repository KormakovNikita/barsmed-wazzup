import { existsSync, mkdirSync } from "fs";
import { join } from "path";

export function ensureMaxPersonalSessionDir(): void {
  mkdirSync(join(process.cwd(), ".data", "max-personal-sessions"), {
    recursive: true,
  });
}

export function getMaxPersonalSessionFilePath(): string {
  ensureMaxPersonalSessionDir();
  return join(
    process.cwd(),
    "sessions",
    `${getMaxPersonalSessionName()}.json`,
  );
}

export function isMaxPersonalEnabled(): boolean {
  return process.env.MAX_PERSONAL_ENABLED !== "false";
}

export function getMaxPersonalSessionName(): string {
  return process.env.MAX_PERSONAL_SESSION_NAME ?? "hubdesk-max-personal";
}

export function hasMaxPersonalSessionFile(): boolean {
  return existsSync(getMaxPersonalSessionFilePath());
}
