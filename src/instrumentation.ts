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
      const { mergeDuplicateMaxConversations } = await import("@/lib/store");
      const merged = mergeDuplicateMaxConversations();
      if (merged > 0) {
        console.info(`[instrumentation] Merged ${merged} duplicate MAX dialogs`);
      }

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
