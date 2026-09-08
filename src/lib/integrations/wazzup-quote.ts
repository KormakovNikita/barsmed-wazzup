/** Extract the quoted/replied-to Wazzup message id from webhook payloads. */
export function extractWazzupQuotedMessageId(msg: {
  refMessageId?: string | null;
  quoted_message_id?: string | null;
  quotedMessageId?: string | null;
  quotedMessage?:
    | string
    | {
        messageId?: string | null;
        id?: string | null;
        mid?: string | null;
        message_id?: string | null;
        text?: string | null;
      }
    | null;
}): string | undefined {
  if (typeof msg.refMessageId === "string" && msg.refMessageId.trim()) {
    return msg.refMessageId.trim();
  }
  if (typeof msg.quoted_message_id === "string" && msg.quoted_message_id.trim()) {
    return msg.quoted_message_id.trim();
  }
  if (typeof msg.quotedMessageId === "string" && msg.quotedMessageId.trim()) {
    return msg.quotedMessageId.trim();
  }
  if (typeof msg.quotedMessage === "string" && msg.quotedMessage.trim()) {
    return msg.quotedMessage.trim();
  }
  if (msg.quotedMessage && typeof msg.quotedMessage === "object") {
    const candidate =
      msg.quotedMessage.messageId ??
      msg.quotedMessage.message_id ??
      msg.quotedMessage.id ??
      msg.quotedMessage.mid;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

export function extractWazzupQuotedText(msg: {
  quotedMessage?:
    | {
        text?: string | null;
        content?: string | null;
      }
    | null;
}): string | undefined {
  if (!msg.quotedMessage || typeof msg.quotedMessage !== "object") {
    return undefined;
  }
  const text = msg.quotedMessage.text ?? msg.quotedMessage.content;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}
