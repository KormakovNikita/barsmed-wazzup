"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Check,
  CheckCheck,
  CornerUpLeft,
  MoreVertical,
  Paperclip,
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
  onSendMessage: (
    content: string,
    file?: File,
    replyToMessageId?: string,
  ) => Promise<void>;
  onDeleteMessage: (messageId: string, revoke: boolean) => Promise<void>;
  onSimulateIncoming: () => Promise<void>;
  onDismissReply?: () => Promise<void>;
  sendError?: string | null;
  onReplyError?: (error: string | null) => void;
}

function ReplyQuote({
  replyTo,
  isOut,
}: {
  replyTo: NonNullable<Message["replyTo"]>;
  isOut: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-2 border-l-2 pl-2 text-xs opacity-90",
        isOut ? "border-primary-foreground/50" : "border-primary/50",
      )}
    >
      <p className="font-medium">
        {replyTo.direction === "out" ? "Вы" : "Клиент"}
      </p>
      <p className="line-clamp-2 whitespace-pre-wrap break-words">
        {replyTo.content}
      </p>
    </div>
  );
}

function messageSupportsReply(
  msg: Message,
  channel: ConversationDetail["channel"],
): boolean {
  if (channel === "telegram") return true;
  if (channel === "max") {
    return Boolean(msg.externalId?.startsWith("mid."));
  }
  return false;
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
  onSendMessage,
  onDeleteMessage,
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
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageCountRef = useRef(0);
  const conversationIdRef = useRef<string | null>(null);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    if (!viewport) return;

    if (behavior === "smooth") {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
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
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }

    const count = conversation?.messages.length ?? 0;
    if (count > messageCountRef.current) {
      scrollMessagesToBottom("smooth");
    }
    messageCountRef.current = count;
  }, [conversation?.id, conversation?.messages, scrollMessagesToBottom]);

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

  function insertText(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setDraft(text);
      return;
    }

    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + text.length;
      textarea.setSelectionRange(caret, caret);
    });
  }

  function insertEmoji(emoji: string) {
    insertText(emoji);
  }

  async function sendTemplateText(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSendMessage(text, undefined, replyToMessage?.id);
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
      <div className="flex flex-1 items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">Загрузка диалога...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
          💬
        </div>
        <div>
          <h2 className="font-semibold">Выберите диалог</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            WhatsApp, Telegram, MAX, VK и Instagram — в одном окне
          </p>
        </div>
      </div>
    );
  }

  const canReplyToMessages =
    conversation.channel === "telegram" || conversation.channel === "max";
  const canDeleteMessages = conversation.channel === "telegram";

  function selectMessageForReply(msg: Message) {
    if (!conversation || !canReplyToMessages) return;
    if (!messageSupportsReply(msg, conversation.channel)) {
      onReplyError?.(
        "На это сообщение нельзя ответить — нет ID в MAX. Запустите синхронизацию истории.",
      );
      return;
    }
    onReplyError?.(null);
    setReplyToMessage(msg);
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">{conversation.contact.name}</h2>
          <ChannelLabel channel={conversation.channel} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conversation.awaitingReply && onDismissReply && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDismissReply}
              disabled={dismissing}
              className="text-xs"
            >
              {dismissing ? "…" : "Можно не отвечать"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onSimulateIncoming}
            className="gap-1.5 text-xs"
          >
            <Zap className="h-3.5 w-3.5" />
            Тест входящего
          </Button>
        </div>
      </header>

      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
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
                  className={cn("group flex items-end gap-1", isOut ? "justify-end" : "justify-start")}
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
                      "order-2 max-w-[75%] rounded-2xl px-3.5 py-2 text-sm transition-colors",
                      isOut
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted",
                      canReplyToMessages && "cursor-pointer hover:brightness-95",
                    )}
                    onDoubleClick={() => {
                      if (canReplyToMessages) selectMessageForReply(msg);
                    }}
                    onContextMenu={(event) => {
                      if (!canReplyToMessages) return;
                      event.preventDefault();
                      selectMessageForReply(msg);
                    }}
                  >
                    {msg.replyTo && (
                      <ReplyQuote replyTo={msg.replyTo} isOut={isOut} />
                    )}
                    {msg.attachments?.map((attachment) => (
                      <div key={attachment.id} className="mb-2 last:mb-0">
                        <AttachmentView attachment={attachment} isOut={isOut} />
                      </div>
                    ))}
                    {msg.content.trim() && (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[10px]",
                        isOut
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>
                        {format(new Date(msg.createdAt), "HH:mm", { locale: ru })}
                      </span>
                      {isOut && <MessageStatusIcon status={msg.status} />}
                    </div>
                  </div>

                  {canReplyToMessages && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="h-7 w-7 shrink-0 opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-accent"
                        title="Действия"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isOut ? "end" : "start"}>
                        <DropdownMenuItem onClick={() => selectMessageForReply(msg)}>
                          <CornerUpLeft className="mr-2 h-4 w-4" />
                          Ответить
                        </DropdownMenuItem>
                        {canDeleteMessages && (
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
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <footer className="shrink-0 border-t p-3">
        {sendError && (
          <p className="mb-2 text-xs text-destructive">{sendError}</p>
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
        <div className="flex gap-2">
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
            variant="outline"
            size="icon"
            className="shrink-0 self-end"
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
            className="min-h-[44px] resize-none"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!draft.trim() && !selectedFile) || sending}
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
