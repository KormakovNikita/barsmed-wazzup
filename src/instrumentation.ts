export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramUserListener, getTelegramMode } = await import(
      "@/lib/integrations/telegram"
    );
    const { isMaxConfigured, registerMaxWebhook } = await import(
      "@/lib/integrations/max",
    );
    const { startMaxPollingListener } = await import(
      "@/lib/integrations/max-polling",
    );

    if (getTelegramMode() === "user") {
      startTelegramUserListener().catch((error) => {
        console.error("[instrumentation] Telegram user listener failed:", error);
      });
    }

    if (isMaxConfigured()) {
      const webhookBase = process.env.WEBHOOK_BASE_URL;
      if (webhookBase) {
        registerMaxWebhook(`${webhookBase}/api/webhooks/max`).catch((error) => {
          console.error("[instrumentation] MAX webhook registration failed:", error);
        });
      } else {
        startMaxPollingListener();
      }
    }
  }
}
