"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { AppSidebar } from "@/components/inbox/app-sidebar";
import { ConversationList, type ConversationListFilter } from "@/components/inbox/conversation-list";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { NewConversationDialog } from "@/components/inbox/new-conversation-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type {
  Channel,
  Contact,
  Conversation,
  ConversationDetail,
  Message,
  Operator,
} from "@/lib/types";

const DEMO_INCOMING_MESSAGES = [
  "Ещё один вопрос по тарифам",
  "Можем созвониться завтра?",
  "Отправил документы на почту",
  "Когда будет ответ?",
];

const POLL_VISIBLE_MS = 3000;
const POLL_HIDDEN_MS = 12000;

function mergeMessage(existing: Message[], incoming: Message): Message[] {
  const index = existing.findIndex(
    (item) =>
      item.id === incoming.id ||
      (incoming.externalId &&
        item.externalId &&
        item.externalId === incoming.externalId),
  );
  if (index >= 0) {
    const next = [...existing];
    next[index] = incoming;
    return next;
  }
  return [...existing, incoming];
}

function mergeConversationDetail(
  prev: ConversationDetail | null,
  incoming: ConversationDetail,
): ConversationDetail {
  if (!prev || prev.id !== incoming.id) return incoming;

  const prevMessages = prev.messages;
  const nextMessages = incoming.messages;

  if (
    prevMessages.length === nextMessages.length &&
    prevMessages.every((msg, index) => {
      const next = nextMessages[index];
      if (!next || msg.id !== next.id) return false;
      return (
        msg.content === next.content &&
        msg.previousContent === next.previousContent &&
        msg.editedAt === next.editedAt
      );
    })
  ) {
    return {
      ...incoming,
      messages: prevMessages,
    };
  }

  return incoming;
}

export function InboxApp() {
  const [activeChannel, setActiveChannel] = useState<Channel | "all">("all");
  const [conversations, setConversations] = useState<
    (Conversation & { contact?: Contact })[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] =
    useState<ConversationDetail | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [stats, setStats] = useState<{
    totalUnread: number;
    byChannel: { channel: Channel; count: number; unread: number }[];
  }>({ totalUnread: 0, byChannel: [] });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ConversationListFilter>("all");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<{
    telegram: {
      configured: boolean;
      connected?: boolean;
      mode: string;
      profile?: { name: string; username?: string } | null;
    };
    max: {
      configured: boolean;
      mode: string;
      connected?: boolean;
      profile?: { name: string; username?: string } | null;
    };
    assignmentStrategy: string;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, integrationsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/integrations/status"),
      ]);
      const data = await statsRes.json();
      const integrations = await integrationsRes.json();
      setOperators(data.operators);
      setStats(data.stats);
      setIntegrationStatus(integrations);
    } catch {
      // stats refresh is best-effort
    }
  }, []);

  const fetchConversations = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingConversations(true);
      try {
        const params = new URLSearchParams();
        if (activeChannel !== "all") {
          params.set("channel", activeChannel);
        }
        if (debouncedSearchQuery) {
          params.set("q", debouncedSearchQuery);
        }
        const query = params.toString();
        const res = await fetch(
          `/api/conversations${query ? `?${query}` : ""}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) {
          throw new Error(`Не удалось загрузить диалоги (${res.status})`);
        }
        const data = await res.json();
        setConversations(data.conversations ?? []);
        setFetchError(null);
      } catch (error) {
        if (!silent) {
          setFetchError(
            error instanceof Error ? error.message : "Ошибка загрузки диалогов",
          );
        }
      } finally {
        if (!silent) setLoadingConversations(false);
      }
    },
    [activeChannel, debouncedSearchQuery],
  );

  const fetchConversationDetail = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoadingDetail(true);
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (selectedIdRef.current !== id) return;
        const conversation = data.conversation as ConversationDetail;
        if (silent) {
          setConversationDetail((prev) => mergeConversationDetail(prev, conversation));
        } else {
          setConversationDetail(conversation);
        }
      } finally {
        if (!silent && selectedIdRef.current === id) {
          setLoadingDetail(false);
        }
      }
    },
    [],
  );

  const refreshInbox = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? true;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      if (silent) setSyncing(true);

      try {
        await fetch("/api/integrations/poll", {
          method: "POST",
          signal: AbortSignal.timeout(12000),
        }).catch(() => undefined);

        await Promise.all([
          fetchConversations({ silent: true }),
          selectedIdRef.current
            ? fetchConversationDetail(selectedIdRef.current, { silent: true })
            : Promise.resolve(),
          fetchStats(),
        ]);
      } finally {
        pollInFlightRef.current = false;
        if (silent) setSyncing(false);
      }
    },
    [fetchConversations, fetchConversationDetail, fetchStats],
  );

  useEffect(() => {
    setLoadingConversations(true);
    fetchConversations();
    fetchStats();
  }, [fetchConversations, fetchStats]);

  useEffect(() => {
    if (!selectedId) {
      setConversationDetail(null);
      return;
    }
    if (conversationDetail?.id === selectedId) return;
    fetchConversationDetail(selectedId);
  }, [selectedId, conversationDetail?.id, fetchConversationDetail]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const schedule = () => {
      if (interval) clearInterval(interval);
      const ms = document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
      interval = setInterval(() => {
        void refreshInbox({ silent: true });
      }, ms);
    };

    schedule();
    void refreshInbox({ silent: true });

    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshInbox]);

  function handleSelect(id: string) {
    if (id === selectedId) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    setMobileOpen(false);
  }

  async function handleSendMessage(
    content: string,
    file?: File,
    replyToMessageId?: string,
  ) {
    if (!selectedId) return;
    setSendError(null);

    let res: Response;
    try {
      if (file) {
        const form = new FormData();
        form.append("content", content);
        if (conversationDetail?.assignedTo) {
          form.append("operatorId", conversationDetail.assignedTo);
        }
        if (replyToMessageId) {
          form.append("replyToMessageId", replyToMessageId);
        }
        form.append("file", file);
        res = await fetch(`/api/conversations/${selectedId}/messages`, {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch(`/api/conversations/${selectedId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            operatorId: conversationDetail?.assignedTo,
            replyToMessageId,
          }),
        });
      }
    } catch {
      setSendError("Не удалось отправить сообщение. Проверьте соединение.");
      throw new Error("network");
    }

    const data = await res.json();
    if (data.error) {
      setSendError(data.error);
    }

    if (data.message) {
      setConversationDetail((prev) => {
        if (!prev || prev.id !== selectedId) return prev;
        return {
          ...prev,
          messages: mergeMessage(prev.messages, data.message as Message),
          lastMessagePreview:
            data.message.content?.trim() || prev.lastMessagePreview,
          updatedAt: data.message.createdAt,
          awaitingReply: false,
          unreadCount: 0,
        };
      });
    }

    if (!res.ok || data.error) {
      throw new Error(data.error ?? "send failed");
    }

    void Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
      fetchStats(),
    ]);
  }

  async function handleDeleteMessage(messageId: string, revoke: boolean) {
    if (!selectedId) return;
    setSendError(null);
    const res = await fetch(
      `/api/messages/${messageId}?revoke=${revoke ? "true" : "false"}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (data.error) {
      setSendError(data.error);
    }
    await Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
    ]);
  }

  async function handleEditMessage(messageId: string, content: string) {
    if (!selectedId) return;
    setSendError(null);
    const res = await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (data.error) {
      setSendError(data.error);
      return;
    }

    if (data.message) {
      setConversationDetail((prev) => {
        if (!prev || prev.id !== selectedId) return prev;
        return {
          ...prev,
          messages: prev.messages.map((message) =>
            message.id === messageId ? (data.message as Message) : message,
          ),
          lastMessagePreview:
            prev.messages[prev.messages.length - 1]?.id === messageId
              ? data.message.content?.trim() || prev.lastMessagePreview
              : prev.lastMessagePreview,
        };
      });
    }

    await Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
    ]);
  }

  async function handleAssign(operatorId: string | null) {
    if (!selectedId) return;
    await fetch(`/api/conversations/${selectedId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorId }),
    });
    await Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
    ]);
  }

  async function handleSimulateIncoming() {
    if (!selectedId) return;
    const content =
      DEMO_INCOMING_MESSAGES[
        Math.floor(Math.random() * DEMO_INCOMING_MESSAGES.length)
      ];
    await fetch("/api/simulate/incoming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedId, content }),
    });
    await Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
    ]);
  }

  async function handleDismissAll() {
    if (dismissingAll || awaitingCount === 0) return;
    setDismissingAll(true);
    try {
      const params = new URLSearchParams();
      if (activeChannel !== "all") {
        params.set("channel", activeChannel);
      }
      const query = params.toString();
      const res = await fetch(
        `/api/conversations/dismiss-all${query ? `?${query}` : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось пометить диалоги прочитанными");
      }

      setConversationDetail((prev) =>
        prev?.awaitingReply
          ? { ...prev, awaitingReply: false, unreadCount: 0 }
          : prev,
      );

      await Promise.all([
        fetchConversations({ silent: true }),
        selectedIdRef.current
          ? fetchConversationDetail(selectedIdRef.current, { silent: true })
          : Promise.resolve(),
        fetchStats(),
      ]);
    } catch (error) {
      setFetchError(
        error instanceof Error ? error.message : "Ошибка при прочтении диалогов",
      );
    } finally {
      setDismissingAll(false);
    }
  }

  async function handleDismissReply() {
    if (!selectedId) return;
    await fetch(`/api/conversations/${selectedId}/dismiss`, {
      method: "POST",
    });
    await Promise.all([
      fetchConversationDetail(selectedId, { silent: true }),
      fetchConversations({ silent: true }),
      fetchStats(),
    ]);
  }

  const activeConversation =
    conversationDetail?.id === selectedId ? conversationDetail : null;
  const isChatInitialLoading = Boolean(
    selectedId && !activeConversation && loadingDetail,
  );

  const awaitingCount = conversations.filter((c) => c.awaitingReply).length;
  const filteredConversations =
    listFilter === "awaiting"
      ? conversations.filter((c) => c.awaitingReply)
      : conversations;

  const conversationListProps = {
    conversations: filteredConversations,
    selectedId,
    onSelect: handleSelect,
    searchQuery,
    onSearchChange: setSearchQuery,
    listFilter,
    onListFilterChange: setListFilter,
    awaitingCount,
    onDismissAll: handleDismissAll,
    dismissingAll,
    loading: loadingConversations && conversations.length === 0,
    error: fetchError,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        channelStats={stats.byChannel}
        totalUnread={stats.totalUnread}
        integrationStatus={integrationStatus}
      />

      <div className="hidden h-full min-h-0 w-[340px] shrink-0 flex-col border-r border-border/60 md:flex">
        <div className="border-b border-border/60 bg-white p-3">
          <NewConversationDialog
            onCreated={(id) => {
              setSelectedId(id);
              fetchConversations({ silent: true });
              fetchConversationDetail(id);
            }}
          />
        </div>
        <div className="min-h-0 flex-1">
          <ConversationList {...conversationListProps} />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="icon">
                  <Menu className="h-4 w-4" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-80 p-0">
              <ConversationList {...conversationListProps} />
            </SheetContent>
          </Sheet>
          <BrandLogo variant="icon" href="/inbox" />
          <span className="font-semibold text-brand-dark">БАРСМЕД</span>
          {syncing && (
            <span className="text-xs text-muted-foreground">синхронизация…</span>
          )}
          {stats.totalUnread > 0 && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {stats.totalUnread} новых
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ChatPanel
            conversation={activeConversation}
            loading={isChatInitialLoading}
            syncing={syncing}
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
            onEditMessage={handleEditMessage}
            onSimulateIncoming={handleSimulateIncoming}
            onDismissReply={handleDismissReply}
            sendError={sendError}
            onReplyError={setSendError}
          />
          <ContactPanel
            conversation={activeConversation}
            operators={operators}
            onAssign={handleAssign}
          />
        </div>
      </div>
    </div>
  );
}
