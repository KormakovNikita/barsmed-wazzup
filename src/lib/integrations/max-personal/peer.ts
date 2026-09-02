import { getMaxPersonalClient } from "@/lib/integrations/max-personal/client";
import { ensureMaxPersonalDialogChatId } from "@/lib/integrations/max-personal/dialog";

function isPhoneIdentifier(value: string): boolean {
  return /^\+?\d[\d\s()-]{8,}$/.test(value);
}

export async function resolveMaxPersonalPeer(
  identifier: string,
): Promise<{ chatId: string; userId: string; name: string } | null> {
  const client = await getMaxPersonalClient();
  if (!client?.isAuthorized || !client.isConnected) return null;

  const trimmed = identifier.trim();
  let userId: string | null = null;
  let name = trimmed;

  if (isPhoneIdentifier(trimmed)) {
    const user = await client.getUserByPhone(trimmed);
    if (!user?.id) return null;

    name = [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || trimmed;
    userId = String(user.id);
  } else if (/^\d+$/.test(trimmed)) {
    userId = trimmed;
    const user = await client.getUser(Number(trimmed)).catch(() => null);
    if (user?.firstname || user?.lastname) {
      name = [user.firstname, user.lastname].filter(Boolean).join(" ").trim();
    } else {
      name = `MAX ${trimmed}`;
    }
  } else {
    return null;
  }

  try {
    const chatId = await ensureMaxPersonalDialogChatId(client, userId);
    return { chatId, userId, name };
  } catch {
    return null;
  }
}
