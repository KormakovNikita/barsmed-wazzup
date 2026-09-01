export type Channel =
  | "whatsapp"
  | "telegram"
  | "max"
  | "vk"
  | "instagram";

export type MessageDirection = "in" | "out";

export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export type AssignmentStrategy = "least_loaded" | "round_robin";

export type DealStage =
  | "new"
  | "negotiation"
  | "proposal"
  | "won"
  | "lost";

export interface Operator {
  id: string;
  name: string;
  avatarInitials: string;
  online: boolean;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  tags: string[];
  dealStage: DealStage;
  notes?: string;
  /** External user ID per channel, e.g. telegram chat id */
  channelUserIds?: Partial<Record<Channel, string>>;
}

export type MessageMediaType =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "voice"
  | "sticker";

export interface MessageAttachment {
  id: string;
  messageId: string;
  type: MessageMediaType;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  storagePath: string;
  url: string;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  createdAt: string;
  operatorId?: string;
  externalId?: string;
  attachments?: MessageAttachment[];
}

export interface IncomingAttachmentPayload {
  type: MessageMediaType;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  buffer: Buffer;
  width?: number;
  height?: number;
}

export interface OutboundAttachmentPayload {
  type: MessageMediaType;
  mimeType: string;
  fileName?: string;
  buffer: Buffer;
}

export interface Conversation {
  id: string;
  contactId: string;
  channel: Channel;
  assignedTo?: string;
  autoAssigned?: boolean;
  externalThreadId?: string;
  unreadCount: number;
  lastMessagePreview: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  contact: Contact;
  messages: Message[];
  assignedOperator?: Operator;
}

export interface IncomingMessagePayload {
  channel: Channel;
  externalThreadId: string;
  externalMessageId: string;
  content: string;
  senderName: string;
  senderUsername?: string;
  /** Channel-native message id for delete/edit APIs */
  channelMessageId?: string;
  attachments?: IncomingAttachmentPayload[];
  /** MAX: dialog chat_id (preferred thread key) */
  maxChatId?: string;
  /** MAX: sender user_id (for delivery and dedup) */
  maxUserId?: string;
  /** in = from client, out = from bot/operator */
  direction?: "in" | "out";
}

export interface OutboundMessagePayload {
  channel: Channel;
  externalThreadId: string;
  content: string;
  attachments?: OutboundAttachmentPayload[];
}
