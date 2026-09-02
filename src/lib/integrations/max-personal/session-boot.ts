import type { WebMaxClient } from "webmaxsocket";

type BootableClient = WebMaxClient & {
  session?: { get(key: string): unknown };
  _token?: string;
  isAuthorized: boolean;
};

export async function bootMaxPersonalClient(
  instance: WebMaxClient,
): Promise<{ ok: boolean; error?: string }> {
  const client = instance as BootableClient;

  await client.connect();

  const token = client.session?.get("token");
  if (!token || String(token).trim() === "") {
    return {
      ok: false,
      error: "Сессия MAX Personal не найдена. Войдите по QR в настройках.",
    };
  }

  client._token = String(token).trim();

  try {
    await client.sync();
    client.isAuthorized = true;
    return { ok: true };
  } catch (error) {
    client.isAuthorized = false;
    const message = error instanceof Error ? error.message : String(error);

    if (/block|ban|restrict|заблок|огранич/i.test(message)) {
      return {
        ok: false,
        error:
          "Аккаунт MAX ограничен или заблокирован. Обратитесь в поддержку MAX или используйте канал MAX (бот Wazzup).",
      };
    }

    return {
      ok: false,
      error:
        "Сессия MAX Personal истекла. Войдите по QR в настройках. Не используйте «Завершить все сессии» в приложении MAX, пока работает HubDesk.",
    };
  }
}
