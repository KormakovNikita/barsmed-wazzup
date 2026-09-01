"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/inbox/app-sidebar";
import { ConversationList } from "@/components/inbox/conversation-list";
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
  Operator,
} from "@/lib/types";

const DEMO_INCOMING_MESSAGES = [
  "Ещё один вопрос по тарифам",
  "Можем созвониться завтра?",
  "Отправил документы на почту",
  "Когда будет ответ?",
];

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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
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

  const fetchStats = useCallback(async () => {
    const [statsRes, integrationsRes] = await Promise.all([
      fetch("/api/stats"),
      fetch("/api/integrations/status"),
    ]);
    const data = await statsRes.json();
    const integrations = await integrationsRes.json();
    setOperators(data.operators);
    setStats(data.stats);
    setIntegrationStatus(integrations);
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const params =
        activeChannel !== "all" ? `?channel=${activeChannel}` : "";
      const res = await fetch(`/api/conversations${params}`);
      if (!res.ok) {
        throw new Error(`Не удалось загрузить диалоги (${res.status})`);
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setFetchError(null);
    } catch (error) {
      setFetchError(
        error instanceof Error ? error.message : "Ошибка загрузки диалогов",
      );
    } finally {
      setLoadingConversations(false);
    }
  }, [activeChannel]);

  const fetchConversationDetail = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoadingDetail(true);
      }
      try {
        const res = await fetch(`/api/conversations/${id}`);
        if (res.ok) {
          const data = await res.json();
          setConversationDetail(data.conversation);
        }
      } finally {
        if (!silent) {
          setLoadingDetail(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    setLoadingConversations(true);
    fetchConversations();
    fetchStats();
  }, [fetchConversations, fetchStats]);

  useEffect(() => {
    if (selectedId) {
      fetchConversationDetail(selectedId);
    } else {
      setConversationDetail(null);
    }
  }, [selectedId, fetchConversationDetail]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const shouldPoll =
        (integrationStatus?.telegram.configured &&
          (integrationStatus.telegram.mode === "polling" ||
            integrationStatus.telegram.mode === "user")) ||
        (integrationStatus?.max.configured &&
          integrationStatus.max.mode === "polling");

      if (shouldPoll) {
        await fetch("/api/integrations/poll", { method: "POST" });
      }

      // Refresh even when poll returns 0 — colleagues may send from another browser
      // while server-side MAX polling already consumed those updates.
      await fetchConversations();
      if (selectedId) {
        await fetchConversationDetail(selectedId, { silent: true });
      }

      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    fetchConversations,
    fetchConversationDetail,
    selectedId,
    integrationStatus,
  ]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    setMobileOpen(false);
    await fetchConversations();
  }

  async function handleSendMessage(
    content: string,
    file?: File,
    replyToMessageId?: string,
  ) {
    if (!selectedId) return;
    setSendError(null);

    let res: Response;
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

    const data = await res.json();
    if (data.error) {
      setSendError(data.error);
    }
    await fetchConversationDetail(selectedId);
    await fetchConversations();
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
    await fetchConversationDetail(selectedId);
    await fetchConversations();
  }

  async function handleAssign(operatorId: string | null) {
    if (!selectedId) return;
    await fetch(`/api/conversations/${selectedId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorId }),
    });
    await fetchConversationDetail(selectedId);
    await fetchConversations();
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
    await fetchConversationDetail(selectedId);
    await fetchConversations();
  }

  const conversationListProps = {
    conversations,
    selectedId,
    onSelect: handleSelect,
    searchQuery,
    onSearchChange: setSearchQuery,
    loading: loadingConversations,
    error: fetchError,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        channelStats={stats.byChannel}
        totalUnread={stats.totalUnread}
        integrationStatus={integrationStatus}
      />

      <div className="hidden h-full min-h-0 w-80 shrink-0 flex-col md:flex">
        <div className="border-b p-3">
          <NewConversationDialog
            onCreated={(id) => {
              setSelectedId(id);
              fetchConversations();
              fetchConversationDetail(id);
            }}
          />
        </div>
        <div className="min-h-0 flex-1">
          <ConversationList {...conversationListProps} />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
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
          <span className="font-semibold">HubDesk</span>
          {stats.totalUnread > 0 && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {stats.totalUnread} новых
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ChatPanel
            conversation={conversationDetail}
            loading={loadingDetail && !conversationDetail}
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
            onSimulateIncoming={handleSimulateIncoming}
            sendError={sendError}
          />
          <ContactPanel
            conversation={conversationDetail}
            operators={operators}
            onAssign={handleAssign}
          />
        </div>
      </div>
    </div>
  );
}
