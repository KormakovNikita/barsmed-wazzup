import { hasWhatsAppSession, isWhatsAppEnabled } from "./session-path";
import { isWhatsAppProxyConfigured } from "./proxy";

export function isWhatsAppConfigured(): boolean {
  return isWhatsAppEnabled() && hasWhatsAppSession();
}

export function getWhatsAppConnectionHint(): string | null {
  if (!isWhatsAppEnabled()) {
    return "WhatsApp отключён на сервере (WHATSAPP_ENABLED=false).";
  }
  if (!isWhatsAppProxyConfigured()) {
    return "Задайте WHATSAPP_PROXY (SOCKS5) — отдельно от MTProxy Telegram.";
  }
  if (!hasWhatsAppSession()) {
    return "Подключите WhatsApp Business по QR-коду в настройках.";
  }
  return null;
}
