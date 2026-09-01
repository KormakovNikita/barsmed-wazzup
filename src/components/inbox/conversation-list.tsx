"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatConversationTime } from "@/lib/format-date";
import { Inbox, MessageCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChannelAvatarBadge } from "@/components/inbox/channel-badge";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import type { Conversation, Contact, Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationWithContact extends Conversation {
  contact?: Contact;
}

export type ConversationListFilter = "all" | "awaiting";

interface ConversationListProps {
  conversations: ConversationWithContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  listFilter?: ConversationListFilter;
  onListFilterChange?: (filter: ConversationListFilter) => void;
  awaitingCount?: number;
  loading?: boolean;
  error?: string | null;
}

function highlightQuery(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/15 px-0.5 text-foreground">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex gap-3 px-3 py-3">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <div className="h-3.5 w-28 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-full animate-pulse rounded-md bg-muted/70" />
      </div>
    </div>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  listFilter = "all",
  onListFilterChange,
  awaitingCount = 0,
  loading = false,
  error = null,
}: ConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);

  const filtered = conversations;

  useEffect(() => {
    const viewport = listRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    if (!viewport) return;

    const handleScroll = () => {
      scrollTopRef.current = viewport.scrollTop;
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const viewport = listRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;
    if (!viewport) return;

    requestAnimationFrame(() => {
      viewport.scrollTop = scrollTopRef.current;
    });
  }, [filtered]);

  return (
    <div ref={listRef} className="flex h-full flex-col bg-card/50">
      <div className="space-y-3 border-b border-border/60 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени и сообщениям..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 rounded-xl border-border/60 bg-background pl-9 shadow-sm"
          />
        </div>

        {onListFilterChange && (
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => onListFilterChange("all")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                listFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Inbox className="h-3.5 w-3.5" />
              Все
            </button>
            <button
              type="button"
              onClick={() => onListFilterChange("awaiting")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                listFilter === "awaiting"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ждут ответа
              {awaitingCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  {awaitingCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">
              {listFilter === "awaiting" ? "Нет диалогов, ждущих ответа" : "Диалоги не найдены"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {listFilter === "awaiting"
                ? "Все клиенты получили ответ"
                : "Попробуйте изменить поиск или фильтр канала"}
            </p>
          </div>
        ) : (
          <ul className="p-2">
            {filtered.map((conv) => {
              const contactName = conv.contact?.name ?? "Неизвестный контакт";
              const isSelected = selectedId === conv.id;

              return (
                <li key={conv.id} className="mb-0.5">
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150",
                      "hover:bg-accent/60 active:scale-[0.995]",
                      isSelected && "bg-primary/8 ring-1 ring-primary/20",
                      conv.awaitingReply && !isSelected && "bg-amber-50/80",
                    )}
                  >
                    <div className="relative shrink-0">
                      <ContactAvatar name={contactName} size="sm" />
                      <ChannelAvatarBadge
                        channel={conv.channel as Channel}
                        className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            conv.awaitingReply ? "font-semibold" : "font-medium",
                          )}
                        >
                          {highlightQuery(contactName, searchQuery)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px]",
                            conv.awaitingReply
                              ? "font-medium text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatConversationTime(new Date(conv.updatedAt))}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-xs",
                            conv.awaitingReply
                              ? "text-foreground/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {conv.searchMatch ? (
                            <>
                              <span className="text-primary/70">↳ </span>
                              {highlightQuery(conv.searchMatch, searchQuery)}
                            </>
                          ) : (
                            highlightQuery(conv.lastMessagePreview, searchQuery)
                          )}
                        </p>
                        {conv.unreadCount > 0 && (
                          <Badge
                            variant={conv.awaitingReply ? "default" : "secondary"}
                            className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[10px]"
                          >
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {conv.awaitingReply && (
                        <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          нужен ответ
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
