import Link from "next/link";
import { MaxConnectPanel } from "@/components/settings/max-connect-panel";
import { TelegramConnectForm } from "@/components/settings/telegram-connect-form";
import { TelegramConnectPanel } from "@/components/settings/telegram-connect-panel";
import { WazzupTelegramPanel } from "@/components/settings/wazzup-telegram-panel";
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

      <WazzupTelegramPanel />

      <section className="space-y-3 rounded-lg border border-dashed p-4">
        <h2 className="text-lg font-semibold">
          Telegram — прямое подключение (MTProto)
        </h2>
        <p className="text-sm text-muted-foreground">
          Без Wazzup: нужны API ID/Hash с my.telegram.org (часто Error в РФ без
          VPN). Задайте <code className="text-xs">TELEGRAM_MODE=user</code>.
        </p>
        <TelegramConnectForm />
      </section>

      <TelegramConnectPanel />

      <MaxConnectPanel />
    </div>
  );
}
