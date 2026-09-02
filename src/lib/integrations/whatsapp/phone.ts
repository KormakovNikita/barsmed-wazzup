/** Normalize phone to digits only, 7XXXXXXXXXX for RU mobiles. */
export function normalizeWhatsAppPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
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

export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const user = jid.split("@")[0]?.split(":")[0];
  if (!user) return null;
  const digits = user.replace(/\D/g, "");
  return digits || null;
}
