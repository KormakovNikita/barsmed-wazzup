import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MaxConnectPanel } from "@/components/settings/max-connect-panel";
import { MaxPersonalConnectForm } from "@/components/settings/max-personal-connect-form";
import { MaxProxyPanel } from "@/components/settings/max-proxy-panel";
import { TelegramConnectForm } from "@/components/settings/telegram-connect-form";
import { TelegramConnectPanel } from "@/components/settings/telegram-connect-panel";
import { VkConnectPanel } from "@/components/settings/vk-connect-panel";
import { WhatsAppConnectForm } from "@/components/settings/whatsapp-connect-form";
import { Button } from "@/components/ui/button";

export default function IntegrationsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-3">
          <BrandLogo href="/inbox" />
          <div>
            <h1 className="text-2xl font-bold text-primary">Интеграции</h1>
            <p className="text-sm text-muted-foreground">
              Подключите каналы для приёма и отправки сообщений клиентам
            </p>
          </div>
        </div>
        <Button variant="outline" render={<Link href="/inbox" />}>
          ← Входящие
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Telegram — аккаунт компании</h2>
        <p className="text-sm text-muted-foreground">
          Клиенты пишут в ваш рабочий Telegram (не в бота). Подключение через QR
          — как в Wazzup, но без их подписки.
        </p>
        <TelegramConnectForm />
      </section>

      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Telegram-бот (@BotFather) — если клиенты пишут именно боту
        </summary>
        <div className="mt-3">
          <TelegramConnectPanel />
        </div>
      </details>

      <MaxConnectPanel />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">WhatsApp Business</h2>
        <p className="text-sm text-muted-foreground">
          Переписка с клиентами в WhatsApp напрямую (WhatsApp Web). В России
          нужен VPN — укажите SOCKS5/HTTP прокси. Без Wazzup.
        </p>
        <WhatsAppConnectForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ВКонтакте — сообщения сообщества</h2>
        <p className="text-sm text-muted-foreground">
          Клиенты пишут в личные сообщения вашего сообщества VK. Система
          получает их через Long Poll (работает без HTTPS) и позволяет отвечать
          из единого inbox.
        </p>
        <VkConnectPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">MAX Personal — исходящие сообщения</h2>
        <p className="text-sm text-muted-foreground">
          Личный аккаунт MAX для написания клиентам первыми. Отдельно от бота
          Wazzup — используйте, когда нужно инициировать диалог по номеру
          телефона или user_id.
        </p>
        <MaxPersonalConnectForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">MAX — голосовые сообщения</h2>
        <MaxProxyPanel />
      </section>
    </div>
  );
}
