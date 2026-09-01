import { getMaxApiBase, getMaxBotToken, type MaxUpdate } from "@/lib/integrations/max";
import type { MaxMessageAttachment } from "@/lib/integrations/max-media";

export interface MaxFetchedMessage {
  timestamp?: number;
  body?: NonNullable<MaxUpdate["message"]>["body"];
  sender?: NonNullable<MaxUpdate["message"]>["sender"];
  recipient?: NonNullable<MaxUpdate["message"]>["recipient"];
  link?: NonNullable<MaxUpdate["message"]>["link"];
}

const pendingMediaRetries = new Map<string, ReturnType<typeof setTimeout>>();

const MEDIA_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 12000, 15000];

function hasMediaAttachments(
  attachments: MaxMessageAttachment[] | undefined,
): boolean {
  if (!attachments?.length) return false;
  return attachments.some((attachment) => {
    if (
      ["image", "video", "audio", "voice", "file"].includes(attachment.type)
    ) {
      return true;
    }
    const payload = attachment.payload;
    return Boolean(payload?.url || payload?.token);
  });
}

export async function fetchMaxMessageById(
  messageId: string,
): Promise<MaxFetchedMessage | null> {
  const token = getMaxBotToken();
  if (!token) return null;

  try {
    const response = await fetch(
      `${getMaxApiBase()}/messages/${encodeURIComponent(messageId)}`,
      {
        headers: { Authorization: token },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      message?: MaxFetchedMessage;
    } & MaxFetchedMessage;

    return data.message ?? data;
  } catch (error) {
    console.error("[max-enrich] fetch message failed:", error);
    return null;
  }
}

/** Merge full message from GET /messages/{mid} into a webhook/polling update. */
export async function enrichMaxUpdate(update: MaxUpdate): Promise<MaxUpdate> {
  if (update.update_type !== "message_created" || !update.message?.body?.mid) {
    return update;
  }

  const mid = update.message.body.mid;
  const fetched = await fetchMaxMessageById(mid);
  if (!fetched?.body) return update;

  const webhookBody = update.message.body;
  const fetchedBody = fetched.body;

  const mergedAttachments =
    fetchedBody.attachments?.length
      ? fetchedBody.attachments
      : webhookBody.attachments;

  return {
    ...update,
    timestamp: fetched.timestamp ?? update.timestamp,
    message: {
      ...update.message,
      sender: update.message.sender ?? fetched.sender,
      recipient: update.message.recipient ?? fetched.recipient,
      link: update.message.link ?? fetched.link,
      body: {
        ...webhookBody,
        ...fetchedBody,
        mid,
        text: fetchedBody.text ?? webhookBody.text,
        attachments: mergedAttachments,
      },
    },
  };
}

function isIncomingUserMessage(update: MaxUpdate): boolean {
  const sender = update.message?.sender;
  return (
    update.update_type === "message_created" &&
    Boolean(sender) &&
    sender?.is_bot !== true
  );
}

function looksLikePendingMedia(update: MaxUpdate): boolean {
  const body = update.message?.body;
  if (!body?.mid || !isIncomingUserMessage(update)) return false;

  const text = body.text?.trim() ?? "";
  if (text) return false;

  return !hasMediaAttachments(body.attachments);
}

export function scheduleMaxMediaRetry(
  update: MaxUpdate,
  processUpdate: (update: MaxUpdate) => Promise<unknown>,
): void {
  const mid = update.message?.body?.mid;
  if (!mid || pendingMediaRetries.has(mid)) return;

  let attempt = 0;

  const run = async () => {
    attempt += 1;
    try {
      const enriched = await enrichMaxUpdate(update);
      if (hasMediaAttachments(enriched.message?.body?.attachments)) {
        await processUpdate(enriched);
        pendingMediaRetries.delete(mid);
        return;
      }

      const text = enriched.message?.body?.text?.trim();
      if (text) {
        await processUpdate(enriched);
        pendingMediaRetries.delete(mid);
        return;
      }

      if (attempt >= MEDIA_RETRY_DELAYS_MS.length) {
        pendingMediaRetries.delete(mid);
        console.info(
          `[max-enrich] message ${mid}: no media after ${attempt} retries (native voice may be unsupported by Bot API)`,
        );
        return;
      }

      const delay = MEDIA_RETRY_DELAYS_MS[attempt] ?? 15000;
      pendingMediaRetries.set(mid, setTimeout(run, delay));
    } catch (error) {
      console.error("[max-enrich] media retry failed:", error);
      pendingMediaRetries.delete(mid);
    }
  };

  pendingMediaRetries.set(mid, setTimeout(run, MEDIA_RETRY_DELAYS_MS[0]));
}

export function shouldScheduleMediaRetry(update: MaxUpdate): boolean {
  return looksLikePendingMedia(update);
}
