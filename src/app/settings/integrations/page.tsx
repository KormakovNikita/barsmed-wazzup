import Link from "next/link";
import { MaxConnectPanel } from "@/components/settings/max-connect-panel";
import { TelegramConnectForm } from "@/components/settings/telegram-connect-form";
import { TelegramConnectPanel } from "@/components/settings/telegram-connect-panel";
import { Button } from "@/components/ui/button";

export default function IntegrationsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Интеграции</h1>
          <p className="text-sm text-muted-foreground">
            Подключите каналы для приёма и отправки сообщений клиентам
          </p>
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
    </div>
  );
}
