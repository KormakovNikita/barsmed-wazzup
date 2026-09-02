import { getSetting } from "@/lib/settings-store";

export function getVkGroupId(): string | null {
  return getSetting("vk_group_id") ?? process.env.VK_GROUP_ID ?? null;
}

export function getVkAccessToken(): string | null {
  return getSetting("vk_access_token") ?? process.env.VK_ACCESS_TOKEN ?? null;
}

export function getVkCallbackConfirmation(): string | null {
  return (
    getSetting("vk_callback_confirmation") ??
    process.env.VK_CALLBACK_CONFIRMATION ??
    null
  );
}

export function getVkCallbackSecret(): string | null {
  return (
    getSetting("vk_callback_secret") ?? process.env.VK_CALLBACK_SECRET ?? null
  );
}

export function isVkConfigured(): boolean {
  return Boolean(getVkGroupId() && getVkAccessToken());
}

export function getVkPollIntervalMs(): number {
  const raw = Number(process.env.VK_POLL_INTERVAL_MS ?? 3000);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 3000;
}

/** Callback API requires HTTPS; Long Poll works on HTTP/IP. */
export function shouldVkUseCallback(): boolean {
  const base =
    process.env.WEBHOOK_BASE_URL ??
    process.env.WAZZUP_WEBHOOK_BASE_URL ??
    "";
  return base.startsWith("https://");
}

export function getVkWebhookUrl(): string | null {
  const base =
    process.env.WEBHOOK_BASE_URL ?? process.env.WAZZUP_WEBHOOK_BASE_URL;
  if (!base?.startsWith("https://")) return null;
  return `${base.replace(/\/$/, "")}/api/webhooks/vk`;
}
