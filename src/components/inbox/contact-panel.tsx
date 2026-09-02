"use client";

import { Building2, Mail, Phone, StickyNote, Tag, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { ChannelLabel } from "@/components/inbox/channel-badge";
import { DEAL_STAGE_LABELS } from "@/lib/channels";
import type { ConversationDetail, Operator } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ContactPanelProps {
  conversation: ConversationDetail | null;
  operators: Operator[];
  onAssign: (operatorId: string | null) => void;
}

export function ContactPanel({
  conversation,
  operators,
  onAssign,
}: ContactPanelProps) {
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

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-white lg:flex">
      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-background p-5 text-center shadow-sm">
            <ContactAvatar name={contact.name} size="lg" />
            <h3 className="mt-4 font-semibold">{contact.name}</h3>
            <div className="mt-2">
              <ChannelLabel channel={conversation.channel} />
            </div>
            <Badge variant="secondary" className="mt-3">
              {stageLabel}
            </Badge>
          </div>

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
                <p className="text-xs text-muted-foreground">Нет контактных данных</p>
              )}
            </div>
          </div>

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

          {contact.notes && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" />
                Заметки
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{contact.notes}</p>
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
                  !conversation.assignedTo && "bg-primary/10 font-medium text-primary",
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
                    conversation.assignedTo === op.id && "bg-primary/10 font-medium text-primary",
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
