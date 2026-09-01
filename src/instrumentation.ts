export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      getTelegramMode,
      isTelegramBotConfigured,
      registerWazzupWebhook,
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
    const { startTelegramUserPollingListener } = await import(
      "@/lib/integrations/telegram-user-polling",
    );

    if (getTelegramMode() === "user") {
      startTelegramUserListener().catch((error) => {
        console.error("[instrumentation] Telegram user listener failed:", error);
      });
      startTelegramUserPollingListener();
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

    if (getTelegramMode() === "wazzup" && process.env.WAZZUP_API_KEY) {
      const webhookBase = process.env.WEBHOOK_BASE_URL;
      if (webhookBase) {
        registerWazzupWebhook(`${webhookBase}/api/webhooks/wazzup`).catch(
          (error) => {
            console.error(
              "[instrumentation] Wazzup webhook registration failed:",
              error,
            );
          },
        );
      }
    }

    if (isMaxConfigured()) {
      const { mergeDuplicateMaxConversations } = await import("@/lib/store");
      const { getMaxIncomingMode } = await import(
        "@/lib/integrations/wazzup-max"
      );
      const merged = mergeDuplicateMaxConversations();
      if (merged > 0) {
        console.info(`[instrumentation] Merged ${merged} duplicate MAX dialogs`);
      }

      const maxIncoming = getMaxIncomingMode();
      const webhookBase = process.env.WEBHOOK_BASE_URL;

      if (maxIncoming === "wazzup" && process.env.WAZZUP_API_KEY && webhookBase) {
        registerWazzupWebhook(`${webhookBase}/api/webhooks/wazzup`).catch(
          (error) => {
            console.error(
              "[instrumentation] Wazzup webhook for MAX voice failed:",
              error,
            );
          },
        );
      }

      if (webhookBase) {
        registerMaxWebhook(`${webhookBase}/api/webhooks/max`).catch((error) => {
          console.error("[instrumentation] MAX webhook registration failed:", error);
        });
      } else {
        startMaxPollingListener();
      }

      if (process.env.MAX_PROXY_ENABLED === "true") {
        const { startMaxProxyListener } = await import(
          "@/lib/integrations/max-proxy"
        );
        startMaxProxyListener().catch((error) => {
          console.error("[instrumentation] MAX proxy listener failed:", error);
        });
      }
    }
  }
}
