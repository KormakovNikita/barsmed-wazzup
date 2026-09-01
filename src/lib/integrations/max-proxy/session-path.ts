import { existsSync, lstatSync, mkdirSync, symlinkSync } from "fs";
import { join, relative } from "path";

/** Persist webmaxsocket sessions under .data (Docker volume). */
export function ensureMaxProxySessionDir(): void {
  const dataSessions = join(process.cwd(), ".data", "max-proxy-sessions");
  const defaultSessions = join(process.cwd(), "sessions");

  mkdirSync(dataSessions, { recursive: true });

  if (!existsSync(defaultSessions)) {
    const relTarget = relative(process.cwd(), dataSessions);
    symlinkSync(relTarget, defaultSessions);
    return;
  }

  try {
    const stat = lstatSync(defaultSessions);
    if (stat.isSymbolicLink()) {
      // already linked — ok
      return;
    }
  } catch {
    // ignore
  }
}

export function isMaxProxyEnabled(): boolean {
  return process.env.MAX_PROXY_ENABLED !== "false";
}

export function getMaxProxySessionName(): string {
  return process.env.MAX_PROXY_SESSION_NAME ?? "hubdesk-max-proxy";
}
