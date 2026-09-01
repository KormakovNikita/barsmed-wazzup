import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/** Ensure persistent session directory exists (.data volume). */
export function ensureMaxProxySessionDir(): void {
  mkdirSync(join(process.cwd(), ".data", "max-proxy-sessions"), {
    recursive: true,
  });
}

export function getMaxProxySessionFilePath(): string {
  ensureMaxProxySessionDir();
  return join(
    process.cwd(),
    "sessions",
    `${getMaxProxySessionName()}.json`,
  );
}

export function isMaxProxyEnabled(): boolean {
  return process.env.MAX_PROXY_ENABLED !== "false";
}

export function getMaxProxySessionName(): string {
  return process.env.MAX_PROXY_SESSION_NAME ?? "hubdesk-max-proxy";
}

export function hasMaxProxySessionFile(): boolean {
  return existsSync(getMaxProxySessionFilePath());
}
