import { getVkGroupInfo } from "./api";
import {
  getVkAccessToken,
  getVkCallbackConfirmation,
  getVkGroupId,
  getVkWebhookUrl,
  isVkConfigured,
  shouldVkUseCallback,
} from "./config";
import { sendVkMessage } from "./send";

export {
  drainVkLongPollUpdates,
  startVkLongPollListener,
} from "./long-poll";
export {
  parseVkCallbackEvent,
  verifyVkCallbackSecret,
  type VkCallbackEvent,
} from "./parse";
export { isVkConfigured, shouldVkUseCallback, getVkWebhookUrl };
export { sendVkMessage };

export async function getVkStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  mode: "long_poll" | "callback";
  profile: { id: number; name: string; screenName?: string } | null;
  error?: string | null;
  webhookUrl?: string | null;
}> {
  const configured = isVkConfigured();
  const mode = shouldVkUseCallback() ? "callback" : "long_poll";

  if (!configured) {
    return {
      configured: false,
      connected: false,
      mode,
      profile: null,
      webhookUrl: getVkWebhookUrl(),
    };
  }

  const groupId = getVkGroupId()!;
  const token = getVkAccessToken()!;
  const info = await getVkGroupInfo(groupId, token);

  if (!info.ok) {
    return {
      configured: true,
      connected: false,
      mode,
      profile: null,
      error: info.error,
      webhookUrl: getVkWebhookUrl(),
    };
  }

  return {
    configured: true,
    connected: true,
    mode,
    profile: {
      id: info.group.id,
      name: info.group.name,
      screenName: info.group.screen_name,
    },
    error: null,
    webhookUrl: getVkWebhookUrl(),
  };
}

export function getVkCallbackConfirmationString(): string | null {
  return getVkCallbackConfirmation();
}
