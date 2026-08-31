import Link from "next/link";
import { MaxConnectPanel } from "@/components/settings/max-connect-panel";
import { TelegramConnectForm } from "@/components/settings/telegram-connect-form";
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
        <h2 className="text-lg font-semibold">Telegram (личный аккаунт)</h2>
        <p className="text-sm text-muted-foreground">
          Пока не настроено — можно подключить позже
        </p>
        <TelegramConnectForm />
      </section>

      <MaxConnectPanel />
    </div>
  );
}
