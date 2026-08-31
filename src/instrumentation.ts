export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      getTelegramMode,
      isTelegramBotConfigured,
      setTelegramWebhook,
      startTelegramUserListener,
    } = await import("@/lib/integrations/telegram");
    const { isMaxConfigured, registerMaxWebhook } = await import(
      "@/lib/integrations/max",
    );
    const { startMaxPollingListener } = await import(
      "@/lib/integrations/max-polling",
    );
    const { startTelegramPollingListener } = await import(
      "@/lib/integrations/telegram-polling",
    );

    if (getTelegramMode() === "user") {
      startTelegramUserListener().catch((error) => {
        console.error("[instrumentation] Telegram user listener failed:", error);
      });
    }

    if (getTelegramMode() === "bot" && isTelegramBotConfigured()) {
      const webhookBase = process.env.WEBHOOK_BASE_URL;
      if (webhookBase) {
        setTelegramWebhook(`${webhookBase}/api/webhooks/telegram`).catch(
          (error) => {
            console.error(
              "[instrumentation] Telegram webhook registration failed:",
              error,
            );
          },
        );
      } else {
        startTelegramPollingListener();
      }
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
