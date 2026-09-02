import { getMaxPersonalClient } from "@/lib/integrations/max-personal/client";

function isPhoneIdentifier(value: string): boolean {
  return /^\+?\d[\d\s()-]{8,}$/.test(value);
}

export async function resolveMaxPersonalPeer(
  identifier: string,
): Promise<{ chatId: string; userId: string; name: string } | null> {
  const client = await getMaxPersonalClient();
  if (!client?.isAuthorized) return null;

  const trimmed = identifier.trim();

  if (isPhoneIdentifier(trimmed)) {
    const user = await client.getUserByPhone(trimmed);
    if (!user?.id) return null;

    const name = [user.firstname, user.lastname]
      .filter(Boolean)
      .join(" ")
      .trim();

    const userId = String(user.id);
    return {
      chatId: userId,
      userId,
      name: name || trimmed,
    };
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      chatId: trimmed,
      userId: trimmed,
      name: `MAX ${trimmed}`,
    };
  }

  return null;
}
