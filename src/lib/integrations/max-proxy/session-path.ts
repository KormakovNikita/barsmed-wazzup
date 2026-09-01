import { existsSync, mkdirSync, symlinkSync } from "fs";
import { join } from "path";

/** Persist webmaxsocket sessions under .data (Docker volume). */
export function ensureMaxProxySessionDir(): void {
  const dataSessions = join(process.cwd(), ".data", "max-proxy-sessions");
  const defaultSessions = join(process.cwd(), "sessions");

  mkdirSync(dataSessions, { recursive: true });

  if (!existsSync(defaultSessions)) {
    symlinkSync(dataSessions, defaultSessions);
  }
}

export function isMaxProxyEnabled(): boolean {
  return process.env.MAX_PROXY_ENABLED !== "false";
}

export function getMaxProxySessionName(): string {
  return process.env.MAX_PROXY_SESSION_NAME ?? "hubdesk-max-proxy";
}
