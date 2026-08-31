"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/inbox/app-sidebar";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactPanel } from "@/components/inbox/contact-panel";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();
    setOperators(data.operators);
    setStats(data.stats);
  }, []);

  const fetchConversations = useCallback(async () => {
    const params =
      activeChannel !== "all" ? `?channel=${activeChannel}` : "";
    const res = await fetch(`/api/conversations${params}`);
    const data = await res.json();
    setConversations(data.conversations);
    await fetchStats();
  }, [activeChannel, fetchStats]);

  const fetchConversationDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setConversationDetail(data.conversation);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) {
      fetchConversationDetail(selectedId);
    } else {
      setConversationDetail(null);
    }
  }, [selectedId, fetchConversationDetail]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedId) fetchConversationDetail(selectedId);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchConversationDetail, selectedId]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    setMobileOpen(false);
    await fetchConversations();
  }

  async function handleSendMessage(content: string) {
    if (!selectedId) return;
    await fetch(`/api/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
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

  const conversationListPanel = (
    <ConversationList
      conversations={conversations}
      selectedId={selectedId}
      onSelect={handleSelect}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        channelStats={stats.byChannel}
        totalUnread={stats.totalUnread}
      />

      <div className="hidden w-80 shrink-0 md:block">{conversationListPanel}</div>

      <div className="flex min-w-0 flex-1 flex-col">
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
              {conversationListPanel}
            </SheetContent>
          </Sheet>
          <span className="font-semibold">HubDesk</span>
          {stats.totalUnread > 0 && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {stats.totalUnread} новых
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <ChatPanel
            conversation={conversationDetail}
            loading={loadingDetail && !!selectedId}
            onSendMessage={handleSendMessage}
            onSimulateIncoming={handleSimulateIncoming}
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
