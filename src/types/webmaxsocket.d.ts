declare module "webmaxsocket" {
  export const Opcode: {
    MSG_SEND: number;
    [key: string]: number;
  };

  export class WebMaxClient {
    constructor(options?: Record<string, unknown>);
    me: { id?: number; firstname?: string; lastname?: string } | null;
    isConnected: boolean;
    isAuthorized: boolean;
    lastSyncPayload?: { chats?: Array<Record<string, unknown>> };
    start(): Promise<void>;
    stop(): Promise<void>;
    connect(): Promise<void>;
    sync(): Promise<unknown>;
    requestQR(): Promise<{
      qrLink: string;
      trackId: string;
      pollingInterval: number;
      expiresAt: number;
    }>;
    checkQRStatus(trackId: string): Promise<{ status?: { loginAvailable?: boolean } }>;
    loginByQR(trackId: string): Promise<unknown>;
    onMessage(handler: (message: MaxProxyMessage) => void | Promise<void>): void;
    onStart(handler: () => void): void;
    getChats(marker?: number): Promise<Array<Record<string, unknown>>>;
    getUser(userId: number): Promise<{
      id?: number;
      firstname?: string;
      lastname?: string;
    }>;
    getHistory(
      chatId: string | number | bigint,
      from?: unknown,
      backward?: number,
      forward?: number,
    ): Promise<MaxProxyMessage[]>;
    sendMessage(params: {
      chatId: string | number;
      text: string;
    }): Promise<{ id?: string | number; error?: string; localizedMessage?: string; message?: string } | unknown>;
    getUserByPhone(phone: string): Promise<{
      id?: number;
      firstname?: string;
      lastname?: string;
    } | null>;
    sendAndWait(
      opcode: number,
      payload: Record<string, unknown>,
      cmd?: number,
      timeout?: number,
    ): Promise<{ payload?: Record<string, unknown> }>;
    requestFileDownloadUrl(params: {
      chatId: string | number | bigint;
      messageId: string | number | bigint;
      fileId: string | number | bigint;
      fileName?: string;
      attachLocalId?: string;
    }): Promise<string>;
  }

  export class MaxProxyMessage {
    id: string | number | null;
    chatId: string | number | bigint | null;
    text: string;
    senderId: number | null;
    sender: { fullname?: string; firstname?: string; username?: string } | null;
    attachments: MaxProxyAttachment[];
    timestamp: number;
    downloadAttachment(
      index?: number,
      options?: { dir?: string; filename?: string },
    ): Promise<{ path: string; contentType: string }>;
    fetchSender(): Promise<unknown>;
    getSenderName(): string;
  }

  export interface MaxProxyAttachment {
    _type?: string;
    type?: string;
    audioId?: number | string;
    token?: string;
    duration?: number;
    baseUrl?: string;
    url?: string;
    fileId?: string | number;
    name?: string;
    fileName?: string;
  }

  export const EventTypes: {
    MESSAGE: string;
    START: string;
  };

  export const ChatActions: {
    RECORDING_VOICE: string;
  };

  export const Opcode: {
    VIDEO_PLAY: number;
    FILE_DOWNLOAD: number;
  };

  export function downloadUrlToTempFile(
    url: string,
    options?: { dir?: string; filename?: string; extFallback?: string },
  ): Promise<{ path: string; contentType: string }>;
}
