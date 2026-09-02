/** Normalize phone to digits only, 7XXXXXXXXXX for RU mobiles. */
export function normalizeWhatsAppPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

/** WhatsApp LID (linked identity) — 14+ digits, not a dialable phone. */
export function isWhatsAppLidIdentifier(id: string): boolean {
  const digits = id.replace(/\D/g, "");
  if (digits.length < 14) return false;
  if (digits.length === 11 && digits.startsWith("7")) return false;
  if (digits.length >= 10 && digits.length <= 13) return false;
  return true;
}

export function isWhatsAppPhoneIdentifier(id: string): boolean {
  const digits = normalizeWhatsAppPhone(id);
  return digits.length >= 10 && digits.length <= 13 && !isWhatsAppLidIdentifier(digits);
}

export function formatWhatsAppPhoneDisplay(phone: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function phoneToWhatsAppJid(phone: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  return `${digits}@s.whatsapp.net`;
}

export function lidToWhatsAppJid(lid: string): string {
  const digits = lid.replace(/\D/g, "");
  return `${digits}@lid`;
}

export function threadIdToWhatsAppJid(threadId: string): string {
  if (isWhatsAppLidIdentifier(threadId)) {
    return lidToWhatsAppJid(threadId);
  }
  return phoneToWhatsAppJid(threadId);
}

export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const user = jid.split("@")[0]?.split(":")[0];
  if (!user) return null;
  const digits = user.replace(/\D/g, "");
  return digits || null;
}
