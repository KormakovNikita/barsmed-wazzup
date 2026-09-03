"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Loader2,
  Mail,
  Pencil,
  Phone,
  StickyNote,
  Tag,
  UserCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { ChannelLabel } from "@/components/inbox/channel-badge";
import { DEAL_STAGE_LABELS, CLIENT_STATUS_LABELS, CLIENT_STATUSES } from "@/lib/channels";
import type { ClientStatus, Contact, ConversationDetail, Operator } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ContactPanelProps {
  conversation: ConversationDetail | null;
  operators: Operator[];
  onAssign: (operatorId: string | null) => void;
  onContactUpdated?: (contact: Contact) => void;
}

export function ContactPanel({
  conversation,
  operators,
  onAssign,
  onContactUpdated,
}: ContactPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!conversation) return;
    setEditing(false);
    setError(null);
    setName(conversation.contact.name);
    setPhone(conversation.contact.phone ?? "");
    setEmail(conversation.contact.email ?? "");
    setCompany(conversation.contact.company ?? "");
    setNotes(conversation.contact.notes ?? "");
  }, [conversation?.contact.id, conversation?.contact.name, conversation?.contact.phone, conversation?.contact.email, conversation?.contact.company, conversation?.contact.notes]);

  if (!conversation) {
    return (
      <div className="hidden w-80 shrink-0 border-l border-border/60 bg-white lg:flex lg:items-center lg:justify-center">
        <div className="px-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Информация о контакте появится при выборе диалога
          </p>
        </div>
      </div>
    );
  }

  const { contact } = conversation;
  const stageLabel = DEAL_STAGE_LABELS[contact.dealStage] ?? contact.dealStage;
  const messengers = contact.channels?.length
    ? contact.channels
    : [conversation.channel];

  async function patchContact(patch: {
    clientStatus?: ClientStatus | null;
    isVip?: boolean;
  }) {
    setStatusSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      onContactUpdated?.(data.contact as Contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Укажите имя");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          company: company.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      onContactUpdated?.(data.contact as Contact);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-white lg:flex">
      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-background p-5 text-center shadow-sm">
            <ContactAvatar name={contact.name} size="lg" />
            {editing ? (
              <div className="mt-4 w-full space-y-3 text-left">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Имя</Label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как сохраним контакт"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone">Телефон</Label>
                  <Input
                    id="contact-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 …"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-company">Компания</Label>
                  <Input
                    id="contact-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-notes">Заметки</Label>
                  <Textarea
                    id="contact-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-4 w-4" />
                    )}
                    Сохранить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      setName(contact.name);
                      setPhone(contact.phone ?? "");
                      setEmail(contact.email ?? "");
                      setCompany(contact.company ?? "");
                      setNotes(contact.notes ?? "");
                    }}
                    disabled={saving}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-4 font-semibold">{contact.name}</h3>
                {contact.isVip && (
                  <span className="mt-1 text-sm font-bold text-red-600">ВИП</span>
                )}
                <div className="mt-2">
                  <ChannelLabel channel={conversation.channel} />
                </div>
                <Badge variant="secondary" className="mt-3">
                  {stageLabel}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Изменить имя
                </Button>
              </>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Статус клиента
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_STATUSES.map((status) => {
                const active = contact.clientStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={statusSaving}
                    onClick={() =>
                      void patchContact({
                        clientStatus: active ? null : status,
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {CLIENT_STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={statusSaving}
              onClick={() => void patchContact({ isVip: !contact.isVip })}
              className={cn(
                "mt-3 flex w-full items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                contact.isVip
                  ? "border-pink-300 bg-pink-50 text-red-600"
                  : "border-border/60 text-muted-foreground hover:bg-accent",
              )}
            >
              {contact.isVip ? "ВИП ✓" : "Отметить ВИП"}
            </button>
            {error && !editing && (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Мессенджеры
            </p>
            <div className="flex flex-wrap gap-2">
              {messengers.map((channel) => {
                const conversationId =
                  contact.channelConversations?.[channel] ??
                  (channel === conversation.channel ? conversation.id : undefined);
                return (
                  <ChannelLabel
                    key={channel}
                    channel={channel}
                    href={
                      conversationId
                        ? `/inbox?conversation=${encodeURIComponent(conversationId)}`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>

          {!editing && (
            <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Контакты
              </p>
              <div className="space-y-2.5 text-sm">
                {contact.phone && (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0 text-primary/70" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0 text-primary/70" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                {contact.company && (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Building2 className="h-4 w-4 shrink-0 text-primary/70" />
                    <span>{contact.company}</span>
                  </div>
                )}
                {!contact.phone && !contact.email && !contact.company && (
                  <p className="text-xs text-muted-foreground">
                    Нет контактных данных
                  </p>
                )}
              </div>
            </div>
          )}

          {contact.tags.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Теги
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {!editing && contact.notes && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" />
                Заметки
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {contact.notes}
              </p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ответственный
            </p>
            {conversation.autoAssigned && conversation.assignedOperator && (
              <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700">
                Назначен автоматически: {conversation.assignedOperator.name}
              </p>
            )}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onAssign(null)}
                className={cn(
                  "flex w-full items-center rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-accent",
                  !conversation.assignedTo &&
                    "bg-primary/10 font-medium text-primary",
                )}
              >
                Не назначен
              </button>
              {operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => onAssign(op.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-accent",
                    conversation.assignedTo === op.id &&
                      "bg-primary/10 font-medium text-primary",
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {op.avatarInitials}
                  </span>
                  <span className="flex-1 text-left">{op.name}</span>
                  {op.online && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
