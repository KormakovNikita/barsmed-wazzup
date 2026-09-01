import { getMaxApiBase, getMaxBotToken } from "@/lib/integrations/max";
import type { MessageMediaType, OutboundAttachmentPayload } from "@/lib/types";

export type MaxUploadType = "image" | "video" | "audio" | "file";

function mapAttachmentToUploadType(
  attachment: OutboundAttachmentPayload,
): MaxUploadType {
  switch (attachment.type) {
    case "image":
    case "sticker":
      return "image";
    case "video":
      return "video";
    case "audio":
    case "voice":
      return "audio";
    default:
      return "file";
  }
}

function mapAttachmentToMaxType(
  attachment: OutboundAttachmentPayload,
): string {
  switch (attachment.type) {
    case "image":
    case "sticker":
      return "image";
    case "video":
      return "video";
    case "audio":
    case "voice":
      return "audio";
    default:
      return "file";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractUploadToken(
  uploadType: MaxUploadType,
  initData: { token?: string; url?: string },
  uploadData: unknown,
): string | undefined {
  if (uploadData && typeof uploadData === "object") {
    const payload = uploadData as {
      token?: string;
      photos?: Record<string, { token?: string }>;
    };

    if (payload.token) return payload.token;

    if (payload.photos) {
      const firstPhoto = Object.values(payload.photos).find(
        (photo) => photo?.token,
      );
      if (firstPhoto?.token) return firstPhoto.token;
    }
  }

  if (initData.token) return initData.token;

  if (uploadType === "image" && initData.url) {
    try {
      const photoIds = new URL(initData.url).searchParams.get("photoIds");
      if (photoIds && uploadData && typeof uploadData === "object") {
        const photos = (uploadData as { photos?: Record<string, { token?: string }> })
          .photos;
        if (photos?.[photoIds]?.token) return photos[photoIds].token;
      }
    } catch {
      // ignore URL parse errors
    }
  }

  return undefined;
}

export async function uploadMaxAttachment(
  attachment: OutboundAttachmentPayload,
): Promise<{ token: string } | { error: string }> {
  const botToken = getMaxBotToken();
  if (!botToken) {
    return { error: "MAX_BOT_TOKEN не задан" };
  }

  const uploadType = mapAttachmentToUploadType(attachment);
  const fileName =
    attachment.fileName ??
    `file${attachment.mimeType.includes("png") ? ".png" : attachment.mimeType.includes("jpeg") ? ".jpg" : ".bin"}`;

  const initResponse = await fetch(
    `${getMaxApiBase()}/uploads?${new URLSearchParams({ type: uploadType })}`,
    {
      method: "POST",
      headers: { Authorization: botToken },
    },
  );

  if (!initResponse.ok) {
    const text = await initResponse.text();
    return { error: text || `MAX uploads ${initResponse.status}` };
  }

  const initData = (await initResponse.json()) as {
    url?: string;
    token?: string;
  };

  if (!initData.url) {
    return { error: "MAX uploads: нет URL для загрузки" };
  }

  const formData = new FormData();
  const blob = new Blob([Uint8Array.from(attachment.buffer)], {
    type: attachment.mimeType,
  });
  formData.append("data", blob, fileName);

  const uploadResponse = await fetch(initData.url, {
    method: "POST",
    headers: { Authorization: botToken },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    return { error: text || `MAX upload ${uploadResponse.status}` };
  }

  let uploadData: unknown = null;
  try {
    uploadData = await uploadResponse.json();
  } catch {
    uploadData = null;
  }

  const uploadToken = extractUploadToken(uploadType, initData, uploadData);

  if (!uploadToken) {
    return { error: "MAX upload: не получен token вложения" };
  }

  return { token: uploadToken };
}

export async function buildMaxOutboundAttachments(
  attachments: OutboundAttachmentPayload[],
): Promise<
  | { attachments: { type: string; payload: { token: string } }[] }
  | { error: string }
> {
  const built: { type: string; payload: { token: string } }[] = [];

  for (const attachment of attachments) {
    const uploaded = await uploadMaxAttachment(attachment);
    if ("error" in uploaded) {
      return { error: uploaded.error };
    }

    built.push({
      type: mapAttachmentToMaxType(attachment),
      payload: { token: uploaded.token },
    });
  }

  return { attachments: built };
}

export async function sendMaxMessageWithRetry(
  url: string,
  body: Record<string, unknown>,
  headers: HeadersInit,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (lastResponse.ok) return lastResponse;

    const text = await lastResponse.text();
    if (
      text.includes("attachment.not.ready") &&
      attempt < 4
    ) {
      await sleep(1000 * (attempt + 1));
      continue;
    }

    return new Response(text, {
      status: lastResponse.status,
      statusText: lastResponse.statusText,
    });
  }

  return lastResponse ?? new Response("", { status: 500 });
}
