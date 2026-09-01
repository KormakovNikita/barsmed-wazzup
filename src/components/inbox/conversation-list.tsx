"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatConversationTime } from "@/lib/format-date";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChannelBadge } from "@/components/inbox/channel-badge";
import type { Conversation, Contact, Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConversationWithContact extends Conversation {
  contact?: Contact;
}

interface ConversationListProps {
  conversations: ConversationWithContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
      <mark className="rounded bg-primary/20 px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
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
    <div ref={listRef} className="flex h-full flex-col border-r bg-card">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени и сообщениям..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">Загрузка диалогов...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">Диалоги не найдены</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    "flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50",
                    selectedId === conv.id &&
                      "border-l-2 border-l-primary bg-accent",
                    conv.awaitingReply &&
                      selectedId !== conv.id &&
                      "bg-primary/5",
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {conv.contact?.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2) ?? "??"}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <ChannelBadge channel={conv.channel as Channel} />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          conv.awaitingReply && "font-semibold",
                        )}
                      >
                        {highlightQuery(
                          conv.contact?.name ?? "Неизвестный контакт",
                          searchQuery,
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatConversationTime(new Date(conv.updatedAt))}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {conv.searchMatch ? (
                          <>
                            <span className="text-primary/80">↳ </span>
                            {highlightQuery(conv.searchMatch, searchQuery)}
                          </>
                        ) : (
                          highlightQuery(conv.lastMessagePreview, searchQuery)
                        )}
                      </p>
                      {conv.unreadCount > 0 && (
                        <Badge
                          variant={conv.awaitingReply ? "default" : "secondary"}
                          className="h-5 min-w-5 shrink-0 justify-center px-1.5 text-[10px]"
                        >
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
