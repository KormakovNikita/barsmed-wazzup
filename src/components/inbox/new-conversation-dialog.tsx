"use client";

import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/lib/types";

interface NewConversationDialogProps {
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ onCreated }: NewConversationDialogProps) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("telegram");
  const [recipient, setRecipient] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, recipient, content }),
      });
      const data = await res.json();

      if (!res.ok && !data.conversation) {
        throw new Error(data.error ?? "Не удалось отправить сообщение");
      }

      if (data.error) {
        setError(data.error);
      }

      if (data.conversation?.id) {
        onCreated(data.conversation.id);
        setOpen(false);
        setRecipient("");
        setContent("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <MessageSquarePlus className="h-4 w-4" />
            Написать клиенту
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое сообщение клиенту</DialogTitle>
          <DialogDescription>
            Telegram: @username или номер телефона. WhatsApp: номер телефона
            (+79001234567). MAX Personal: номер телефона или user_id. MAX (бот):
            user_id или chat_id.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Канал</Label>
            <Select
              value={channel}
              onValueChange={(value) => setChannel(value as Channel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="max_personal">MAX Personal</SelectItem>
                <SelectItem value="max">MAX (бот)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipient">Получатель</Label>
            <Input
              id="recipient"
              placeholder={
                channel === "telegram"
                  ? "@username или +79001234567"
                  : channel === "whatsapp"
                    ? "+79001234567"
                    : channel === "max_personal"
                      ? "+79001234567 или user_id"
                      : "user_id"
              }
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">Сообщение</Label>
            <Textarea
              id="message"
              rows={4}
              placeholder="Текст сообщения..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !recipient.trim() || !content.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
