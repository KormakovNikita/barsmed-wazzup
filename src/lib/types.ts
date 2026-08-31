export type Channel = "whatsapp" | "telegram" | "vk" | "instagram";

export type MessageDirection = "in" | "out";

export type MessageStatus = "sent" | "delivered" | "read" | "failed";

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
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  createdAt: string;
  operatorId?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  channel: Channel;
  assignedTo?: string;
  unreadCount: number;
  lastMessagePreview: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  contact: Contact;
  messages: Message[];
  assignedOperator?: Operator;
}
