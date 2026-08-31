"use client";

import { Building2, Mail, Phone, StickyNote, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      <div className="hidden w-72 shrink-0 border-l bg-card lg:flex lg:items-center lg:justify-center">
        <p className="px-4 text-center text-sm text-muted-foreground">
          Информация о контакте появится при выборе диалога
        </p>
      </div>
    );
  }

  const { contact } = conversation;
  const stageLabel = DEAL_STAGE_LABELS[contact.dealStage] ?? contact.dealStage;

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l bg-card lg:flex">
      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {contact.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
            <h3 className="mt-3 font-semibold">{contact.name}</h3>
            <Badge variant="secondary" className="mt-2">
              {stageLabel}
            </Badge>
          </div>

          <Separator className="my-4" />

          <div className="space-y-3 text-sm">
            {contact.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4 shrink-0" />
                <span>{contact.company}</span>
              </div>
            )}
          </div>

          {contact.tags.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
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
            </>
          )}

          {contact.notes && (
            <>
              <Separator className="my-4" />
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" />
                  Заметки
                </div>
                <p className="text-sm text-muted-foreground">{contact.notes}</p>
              </div>
            </>
          )}

          <Separator className="my-4" />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Ответственный
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onAssign(null)}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  !conversation.assignedTo && "bg-accent font-medium",
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
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                    conversation.assignedTo === op.id && "bg-accent font-medium",
                  )}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium">
                    {op.avatarInitials}
                  </span>
                  <span className="flex-1 text-left">{op.name}</span>
                  {op.online && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
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
