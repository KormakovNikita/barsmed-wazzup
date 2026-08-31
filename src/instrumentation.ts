export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramUserListener, getTelegramMode } = await import(
      "@/lib/integrations/telegram"
    );

    if (getTelegramMode() === "user") {
      startTelegramUserListener().catch((error) => {
        console.error("[instrumentation] Telegram user listener failed:", error);
      });
    }
  }
}
