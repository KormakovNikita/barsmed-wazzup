"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  MoreVertical,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelLabel } from "@/components/inbox/channel-badge";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { EmojiPicker } from "@/components/inbox/emoji-picker";
import { TemplatePicker } from "@/components/inbox/template-picker";
import type { ConversationDetail, Message, MessageAttachment } from "@/lib/types";
import {
  formatMessageDateLabel,
  formatMessageDayKey,
} from "@/lib/format-date";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  conversation: ConversationDetail | null;
  loading: boolean;
  syncing?: boolean;
  onSendMessage: (
    content: string,
    file?: File,
    replyToMessageId?: string,
  ) => Promise<void>;
  onDeleteMessage: (messageId: string, revoke: boolean) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onSimulateIncoming: () => Promise<void>;
  onDismissReply?: () => Promise<void>;
  sendError?: string | null;
  onReplyError?: (error: string | null) => void;
}

function ReplyQuote({
  replyTo,
  isOut,
  onJump,
}: {
  replyTo: NonNullable<Message["replyTo"]>;
  isOut: boolean;
  onJump?: (messageId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onJump?.(replyTo.messageId);
      }}
      className={cn(
        "mb-2 w-full border-l-2 pl-2 text-left text-xs opacity-90 transition-opacity hover:opacity-100",
        isOut ? "border-white/40" : "border-primary/40",
        onJump && "cursor-pointer",
      )}
    >
      <p className="font-medium">
        {replyTo.direction === "out" ? "Вы" : "Клиент"}
      </p>
      <p className="line-clamp-2 whitespace-pre-wrap break-words">
        {replyTo.content}
      </p>
    </button>
  );
}

function messageSupportsReply(
  msg: Message,
  channel: ConversationDetail["channel"],
): boolean {
  if (channel === "telegram") return true;
  if (channel === "max") {
    if (!msg.externalId) return false;
    if (msg.externalId.startsWith("mid.")) return true;
    if (/^wazzup-max-/i.test(msg.externalId)) return true;
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        msg.externalId,
      )
    ) {
      return true;
    }
    if (/^max-(mid\.)/.test(msg.externalId)) return true;
    return false;
  }
  if (channel === "vk") {
    return Boolean(msg.externalId?.startsWith("vk-"));
  }
  return false;
}

function canEditOutboundMessage(
  msg: Message,
  channel: ConversationDetail["channel"],
): boolean {
  if (msg.direction !== "out") return false;
  if (msg.attachments?.length) return false;
  if (!msg.content.trim()) return false;
  if (!msg.externalId) return false;
  return channel === "telegram" || channel === "vk";
}

function channelSupportsRemoteDelete(channel: ConversationDetail["channel"]): boolean {
  return channel === "telegram" || channel === "vk";
}

function normalizeClipboardFile(file: File): File {
  if (file.name && file.name !== "image.png" && file.name !== "blob") {
    return file;
  }
  const ext = file.type.includes("png")
    ? ".png"
    : file.type.includes("jpeg") || file.type.includes("jpg")
      ? ".jpg"
      : file.type.includes("webp")
        ? ".webp"
        : file.type.includes("gif")
          ? ".gif"
          : file.type.includes("mp4")
            ? ".mp4"
            : file.type.includes("pdf")
              ? ".pdf"
              : file.type.includes("ogg")
                ? ".ogg"
                : file.type.includes("mpeg") || file.type.includes("mp3")
                  ? ".mp3"
                  : "";
  const name = file.name && file.name !== "blob"
    ? file.name
    : `clipboard-${Date.now()}${ext || ".bin"}`;
  return new File([file], name, { type: file.type || "application/octet-stream" });
}

function pickFileFromClipboard(
  clipboardData: DataTransfer | null,
): File | null {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) return normalizeClipboardFile(file);
  }

  return null;
}

function attachmentLabel(file: File): string {
  if (file.type.startsWith("image/")) return "📷 Изображение";
  if (file.type.startsWith("video/")) return "🎬 Видео";
  if (file.type.startsWith("audio/")) return "🎵 Аудио";
  return "📎 Файл";
}

function messagePreview(msg: Message): string {
  if (msg.content.trim()) return msg.content.trim();
  if (msg.attachments?.length) {
    const attachment = msg.attachments[0];
    if (attachment.type === "image") return "📷 Фото";
    if (attachment.type === "video") return "🎬 Видео";
    if (attachment.type === "voice") return "🎤 Голосовое";
    if (attachment.type === "audio") return "🎵 Аудио";
    return attachment.fileName ? `📎 ${attachment.fileName}` : "📎 Файл";
  }
  return "Сообщение";
}

function MessageStatusIcon({ status }: { status: Message["status"] }) {
  if (status === "failed") {
    return <span className="text-destructive">!</span>;
  }
  if (status === "read") {
    return <CheckCheck className="h-3 w-3 text-sky-500" />;
  }
  if (status === "delivered" || status === "sent") {
    return <Check className="h-3 w-3 text-muted-foreground" />;
  }
  return null;
}

function AttachmentView({
  attachment,
  isOut,
}: {
  attachment: MessageAttachment;
  isOut: boolean;
}) {
  const url = attachment.url;

  if (attachment.type === "image" || attachment.type === "sticker") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.fileName ?? "Изображение"}
          className="max-h-64 max-w-full rounded-lg object-contain"
        />
      </a>
    );
  }

  if (attachment.type === "video") {
    return (
      <video
        src={url}
        controls
        className="max-h-64 max-w-full rounded-lg"
        preload="metadata"
      />
    );
  }

  if (attachment.type === "audio" || attachment.type === "voice") {
    return <audio src={url} controls className="w-full min-w-[220px]" preload="metadata" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm underline-offset-2 hover:underline",
        isOut ? "text-primary-foreground" : "text-foreground",
      )}
    >
      📎 {attachment.fileName ?? "Скачать файл"}
    </a>
  );
}

export function ChatPanel({
  conversation,
  loading,
  syncing = false,
  onSendMessage,
  onDeleteMessage,
  onEditMessage,
  onSimulateIncoming,
  onDismissReply,
  sendError,
  onReplyError,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageCountRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    if (!viewport) return;

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearBottom = distanceFromBottom < 120;

    if (behavior === "smooth" && !isNearBottom) return;

    if (behavior === "smooth") {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    const element = document.getElementById(`message-${messageId}`);
    if (!viewport || !element) return;

    const viewportRect = viewport.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset =
      elementRect.top -
      viewportRect.top +
      viewport.scrollTop -
      viewport.clientHeight / 2 +
      elementRect.height / 2;

    viewport.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });

    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedFile?.type.startsWith("image/")) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (conversation?.id !== conversationIdRef.current) {
      conversationIdRef.current = conversation?.id ?? null;
      messageCountRef.current = conversation?.messages.length ?? 0;
      setSelectedFile(null);
      setReplyToMessage(null);
      setEditingMessageId(null);
      setEditDraft("");
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }

    const count = conversation?.messages.length ?? 0;
    if (count > messageCountRef.current) {
      scrollMessagesToBottom(sending ? "auto" : "smooth");
    }
    messageCountRef.current = count;
  }, [conversation?.id, conversation?.messages, scrollMessagesToBottom, sending]);

  async function handleSend() {
    if ((!draft.trim() && !selectedFile) || sending) return;
    setSending(true);
    try {
      await onSendMessage(
        draft,
        selectedFile ?? undefined,
        replyToMessage?.id,
      );
      setDraft("");
      setSelectedFile(null);
      setReplyToMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const file = pickFileFromClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    setSelectedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function insertText(text: string, file?: File) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setDraft(text);
      if (file) setSelectedFile(file);
      return;
    }

    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    if (file) setSelectedFile(file);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + text.length;
      textarea.setSelectionRange(caret, caret);
    });
  }

  function insertEmoji(emoji: string) {
    insertText(emoji);
  }

  async function sendTemplateText(text: string, file?: File) {
    if ((!text.trim() && !file) || sending) return;
    setSending(true);
    try {
      await onSendMessage(text, file, replyToMessage?.id);
      setDraft("");
      setSelectedFile(null);
      setReplyToMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded-md bg-muted/70" />
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                index % 2 === 0 ? "justify-start" : "justify-end",
              )}
            >
              <div
                className={cn(
                  "h-12 animate-pulse rounded-2xl bg-muted/80",
                  index % 2 === 0 ? "w-[58%]" : "w-[42%]",
                )}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-chat-pattern px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 shadow-sm">
          <span className="text-3xl">💬</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Выберите диалог</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Все каналы в одном окне — отвечайте клиентам быстро и удобно
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          <kbd className="rounded-md border bg-background px-2 py-1 shadow-sm">Enter</kbd>
          <span>отправить</span>
          <kbd className="rounded-md border bg-background px-2 py-1 shadow-sm">Shift+Enter</kbd>
          <span>новая строка</span>
        </div>
      </div>
    );
  }

  const canReplyToMessages =
    conversation.channel === "telegram" ||
    conversation.channel === "max" ||
    conversation.channel === "vk";
  const canRemoteDelete = channelSupportsRemoteDelete(conversation.channel);

  function selectMessageForReply(msg: Message) {
    if (!conversation || !canReplyToMessages) return;
    if (!messageSupportsReply(msg, conversation.channel)) {
      onReplyError?.(
        "На это сообщение нельзя ответить цитатой — нет ID в MAX. Отправьте обычное сообщение или синхронизируйте историю.",
      );
      return;
    }
    onReplyError?.(null);
    setReplyToMessage(msg);
  }

  function startEditing(msg: Message) {
    setEditingMessageId(msg.id);
    setEditDraft(msg.content);
    setReplyToMessage(null);
  }

  function cancelEditing() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveEditing() {
    if (!editingMessageId || !onEditMessage || editSaving) return;
    setEditSaving(true);
    try {
      await onEditMessage(editingMessageId, editDraft);
      setEditingMessageId(null);
      setEditDraft("");
    } finally {
      setEditSaving(false);
    }
  }

  async function copyMessageText(msg: Message) {
    const text = messagePreview(msg);
    try {
      await navigator.clipboard.writeText(text);
      onReplyError?.(null);
    } catch {
      onReplyError?.("Не удалось скопировать текст");
    }
  }

  async function handleDismissReply() {
    if (!onDismissReply || dismissing) return;
    setDismissing(true);
    try {
      await onDismissReply();
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {syncing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/10">
          <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] bg-primary/60" />
        </div>
      )}
      <header className="glass-panel flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar name={conversation.contact.name} size="sm" />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{conversation.contact.name}</h2>
            <ChannelLabel channel={conversation.channel} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conversation.awaitingReply && (
            <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 sm:inline">
              ждёт ответа
            </span>
          )}
          {conversation.awaitingReply && onDismissReply && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDismissReply}
              disabled={dismissing}
              className="text-xs"
            >
              {dismissing ? "…" : "Не отвечать"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background hover:bg-accent"
              title="Действия"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSimulateIncoming}>
                <Zap className="mr-2 h-4 w-4" />
                Тест входящего
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden scroll-smooth bg-chat-pattern">
        <ScrollArea className="h-full">
          <div className="space-y-3 px-4 py-4">
            {conversation.messages.map((msg, index) => {
              const isOut = msg.direction === "out";
              const msgDate = new Date(msg.createdAt);
              const prevMsg =
                index > 0 ? conversation.messages[index - 1] : null;
              const showDateSeparator =
                !prevMsg ||
                formatMessageDayKey(msgDate) !==
                  formatMessageDayKey(new Date(prevMsg.createdAt));

              return (
                <Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {formatMessageDateLabel(msgDate)}
                      </span>
                    </div>
                  )}
                <div
                  id={`message-${msg.id}`}
                  className={cn(
                    "group flex items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200",
                    isOut ? "justify-end" : "justify-start",
                    highlightedMessageId === msg.id && "message-highlight",
                  )}
                >
                  {canReplyToMessages && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 shrink-0 opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                        isOut ? "order-3" : "order-1",
                      )}
                      title="Ответить"
                      onClick={() => selectMessageForReply(msg)}
                    >
                      <CornerUpLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <div
                    className={cn(
                      "order-2 max-w-[78%] rounded-2xl px-3.5 py-2 text-sm transition-all duration-150",
                      isOut
                        ? "bubble-out rounded-br-sm"
                        : "bubble-in rounded-bl-sm text-foreground",
                      highlightedMessageId === msg.id &&
                        "ring-2 ring-amber-400/80 shadow-md",
                    )}
                  >
                    {msg.replyTo && (
                      <ReplyQuote
                        replyTo={msg.replyTo}
                        isOut={isOut}
                        onJump={scrollToMessage}
                      />
                    )}
                    {editingMessageId === msg.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          rows={3}
                          className="min-h-[72px] resize-none border-white/20 bg-black/10 text-sm text-inherit"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={cancelEditing}
                            disabled={editSaving}
                          >
                            Отмена
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => void saveEditing()}
                            disabled={editSaving || !editDraft.trim()}
                          >
                            {editSaving ? "…" : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.attachments?.map((attachment) => (
                          <div key={attachment.id} className="mb-2 last:mb-0">
                            <AttachmentView attachment={attachment} isOut={isOut} />
                          </div>
                        ))}
                        {msg.previousContent?.trim() && (
                          <p
                            className={cn(
                              "mb-1 whitespace-pre-wrap break-words text-[13px] line-through opacity-60",
                              isOut ? "text-white/70" : "text-muted-foreground",
                            )}
                          >
                            {msg.previousContent}
                          </p>
                        )}
                        {msg.content.trim() && (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                        <div
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px]",
                            isOut ? "text-white/75" : "text-muted-foreground",
                          )}
                        >
                          <span>
                            {format(new Date(msg.createdAt), "HH:mm", { locale: ru })}
                          </span>
                          {msg.editedAt && (
                            <span className="italic opacity-80">изменено</span>
                          )}
                          {isOut && <MessageStatusIcon status={msg.status} />}
                        </div>
                      </>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="h-7 w-7 shrink-0 opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-accent"
                      title="Действия"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isOut ? "end" : "start"}>
                      {canReplyToMessages && messageSupportsReply(msg, conversation.channel) && (
                        <DropdownMenuItem onClick={() => selectMessageForReply(msg)}>
                          <CornerUpLeft className="mr-2 h-4 w-4" />
                          Ответить
                        </DropdownMenuItem>
                      )}
                      {(msg.content.trim() || msg.attachments?.length) && (
                        <DropdownMenuItem onClick={() => void copyMessageText(msg)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Копировать
                        </DropdownMenuItem>
                      )}
                      {isOut && canEditOutboundMessage(msg, conversation.channel) && onEditMessage && (
                        <DropdownMenuItem onClick={() => startEditing(msg)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Редактировать
                        </DropdownMenuItem>
                      )}
                      {isOut && (
                        <>
                          <DropdownMenuItem
                            onClick={() => onDeleteMessage(msg.id, false)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить у меня
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDeleteMessage(msg.id, true)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить у всех
                          </DropdownMenuItem>
                        </>
                      )}
                      {!isOut && canRemoteDelete && (
                        <>
                          <DropdownMenuItem
                            onClick={() => onDeleteMessage(msg.id, false)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить у меня
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDeleteMessage(msg.id, true)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить у всех
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </Fragment>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <footer className="glass-panel shrink-0 border-t border-border/60 p-3">
        {sendError && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <p className="min-w-0 flex-1 leading-snug">{sendError}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => onReplyError?.(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {replyToMessage && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary">
                Ответ{" "}
                {replyToMessage.direction === "out" ? "вам" : conversation.contact.name}
              </p>
              <p className="truncate text-muted-foreground">
                {messagePreview(replyToMessage)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setReplyToMessage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            {filePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={filePreviewUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <Paperclip className="h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {attachmentLabel(selectedFile)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Убрать
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background p-2 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setSelectedFile(file ? normalizeClipboardFile(file) : null);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 self-end text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <EmojiPicker onSelect={insertEmoji} disabled={sending} />
          <TemplatePicker
            disabled={sending}
            contactName={conversation.contact.name}
            onInsert={insertText}
            onSend={sendTemplateText}
          />
          <Textarea
            ref={textareaRef}
            placeholder={
              replyToMessage
                ? "Напишите ответ..."
                : "Напишите сообщение или вставьте файл (Ctrl+V)..."
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={2}
            className="min-h-[44px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!draft.trim() && !selectedFile) || sending}
            className="h-10 w-10 shrink-0 self-end rounded-xl shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
