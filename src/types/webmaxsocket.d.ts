declare module "webmaxsocket" {
  export interface WebMaxAttachment {
    _type?: string;
    type?: string;
    name?: string;
    fileName?: string;
    filename?: string;
    baseUrl?: string;
    url?: string;
    fileId?: number | string;
  }

  export interface WebMaxUser {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
    phone?: string;
    fullname?: string;
  }

  export interface WebMaxMessage {
    id: number | bigint;
    chatId: number;
    text: string;
    senderId: number;
    sender: WebMaxUser | null;
    timestamp: number;
    replyTo?: number | bigint | null;
    attachments: WebMaxAttachment[];
    downloadAttachment(
      index?: number,
      options?: { dir?: string; filename?: string },
    ): Promise<{ path: string; contentType: string }>;
    getSenderName(): string;
    fetchSender(): Promise<WebMaxUser | null>;
  }

  export class WebMaxClient {
    constructor(options?: Record<string, unknown>);
    me: WebMaxUser | null;
    isAuthorized: boolean;
    lastSyncPayload?: {
      chats?: { id?: number }[];
      profile?: unknown;
    } | null;
    session: {
      get(key: string, defaultValue?: unknown): unknown;
      set(key: string, value: unknown): void;
      clear(): void;
      destroy(): void;
      data: Record<string, unknown>;
    };

    connect(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    sync(): Promise<unknown>;
    logout(): Promise<void>;

    requestQR(): Promise<{
      qrLink: string;
      trackId: string;
      pollingInterval: number;
      expiresAt: number;
    }>;
    checkQRStatus(trackId: string): Promise<{
      status?: { loginAvailable?: boolean };
    }>;
    loginByQR(trackId: string): Promise<{
      tokenAttrs?: { LOGIN?: { token?: string } };
    }>;

    onMessage(handler: (message: WebMaxMessage) => void | Promise<void>): void;
    onStart(handler: () => void | Promise<void>): void;
    onError(handler: (error: Error) => void | Promise<void>): void;

    sendMessage(options: {
      chatId: number;
      text?: string;
      replyTo?: number | bigint | string | null;
      attachments?: unknown[];
    }): Promise<WebMaxMessage>;

    uploadPhoto(chatId: number, filePath: string): Promise<unknown>;
    uploadVideo(chatId: number, filePath: string): Promise<unknown>;
    uploadFile(
      chatId: number,
      filePath: string,
      options?: { filename?: string; mimeType?: string },
    ): Promise<unknown>;
    uploadAudio(chatId: number, filePath: string): Promise<unknown>;

    getHistory(
      chatId: number,
      from?: number,
      backward?: number,
      forward?: number,
    ): Promise<WebMaxMessage[]>;
  }

  export function extFromAttachType(type: string): string;
}
