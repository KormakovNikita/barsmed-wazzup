import { isLidUser, jidDecode, type WASocket } from "@whiskeysockets/baileys";
import {
  isWhatsAppLidIdentifier,
  isWhatsAppPhoneIdentifier,
  lidToWhatsAppJid,
  normalizeWhatsAppPhone,
  phoneToWhatsAppJid,
} from "@/lib/integrations/whatsapp/phone";

function lidMapping(sock: WASocket) {
  return sock.signalRepository.lidMapping;
}

export async function resolveLidToPhone(
  sock: WASocket,
  lid: string,
): Promise<string | null> {
  const digits = lid.replace(/\D/g, "");
  if (!digits) return null;
  try {
    const pn = await lidMapping(sock).getPNForLID(digits);
    if (!pn) return null;
    const decoded = jidDecode(pn);
    const user = decoded?.user;
    if (!user) return null;
    return normalizeWhatsAppPhone(user);
  } catch {
    return null;
  }
}

export async function resolvePhoneToLid(
  sock: WASocket,
  phone: string,
): Promise<string | null> {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!isWhatsAppPhoneIdentifier(normalized)) return null;
  try {
    return await lidMapping(sock).getLIDForPN(phoneToWhatsAppJid(normalized));
  } catch {
    return null;
  }
}

/** Canonical thread id for storage: prefer phone when LID maps to one. */
export async function resolveInboundWhatsAppThreadId(
  sock: WASocket,
  remoteJid: string | null | undefined,
): Promise<{ threadId: string; jid: string } | null> {
  if (!remoteJid) return null;

  if (isLidUser(remoteJid)) {
    const lid = jidDecode(remoteJid)?.user;
    if (!lid) return null;
    const phone = await resolveLidToPhone(sock, lid);
    return {
      threadId: phone ?? lid,
      jid: remoteJid,
    };
  }

  const decoded = jidDecode(remoteJid);
  const user = decoded?.user;
  if (!user) return null;

  const phone = normalizeWhatsAppPhone(user);
  if (!isWhatsAppPhoneIdentifier(phone)) {
    return { threadId: user, jid: remoteJid };
  }

  return { threadId: phone, jid: remoteJid };
}

/** JID for outbound send — LID chats need @lid, phones prefer mapped LID or @s.whatsapp.net. */
export async function resolveOutboundWhatsAppJid(
  sock: WASocket,
  externalThreadId: string,
): Promise<string | null> {
  const raw = externalThreadId.trim();
  if (!raw) return null;

  if (isWhatsAppLidIdentifier(raw)) {
    const digits = raw.replace(/\D/g, "");
    const phone = await resolveLidToPhone(sock, digits);
    if (phone) {
      const lid = await resolvePhoneToLid(sock, phone);
      if (lid) return lidToWhatsAppJid(lid);
    }
    return lidToWhatsAppJid(digits);
  }

  const phone = normalizeWhatsAppPhone(raw);
  if (!isWhatsAppPhoneIdentifier(phone)) return null;

  const lid = await resolvePhoneToLid(sock, phone);
  if (lid) return lidToWhatsAppJid(lid);

  return phoneToWhatsAppJid(phone);
}
