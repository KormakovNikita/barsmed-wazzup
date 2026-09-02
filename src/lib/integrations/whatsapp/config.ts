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
    return "Для работы в РФ задайте SOCKS5/HTTP прокси (VPN) в настройках WhatsApp.";
  }
  if (!hasWhatsAppSession()) {
    return "Подключите WhatsApp Business по QR-коду в настройках.";
  }
  return null;
}
