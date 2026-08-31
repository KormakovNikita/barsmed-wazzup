"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, CheckCheck, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChannelLabel } from "@/components/inbox/channel-badge";
import type { ConversationDetail, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  conversation: ConversationDetail | null;
  loading: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onSimulateIncoming: () => Promise<void>;
  sendError?: string | null;
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

export function ChatPanel({
  conversation,
  loading,
  onSendMessage,
  onSimulateIncoming,
  sendError,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  async function handleSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await onSendMessage(draft);
      setDraft("");
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

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">{conversation.contact.name}</h2>
          <ChannelLabel channel={conversation.channel} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSimulateIncoming}
          className="gap-1.5 text-xs"
        >
          <Zap className="h-3.5 w-3.5" />
          Тест входящего
        </Button>
      </header>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-4">
          {conversation.messages.map((msg) => {
            const isOut = msg.direction === "out";
            return (
              <div
                key={msg.id}
                className={cn("flex", isOut ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    isOut
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
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
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <footer className="border-t p-3">
        {sendError && (
          <p className="mb-2 text-xs text-destructive">{sendError}</p>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Напишите сообщение..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="min-h-[44px] resize-none"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
