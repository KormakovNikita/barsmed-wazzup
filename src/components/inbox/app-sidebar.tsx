"use client";

import Link from "next/link";
import {
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CHANNEL_CONFIG } from "@/lib/channels";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Дашборд", href: "#", disabled: true },
  { icon: Inbox, label: "Входящие", href: "/inbox", active: true },
  { icon: Users, label: "Контакты", href: "#", disabled: true },
  { icon: Settings, label: "Интеграции", href: "/settings/integrations", disabled: false },
];

interface AppSidebarProps {
  activeChannel: Channel | "all";
  onChannelChange: (channel: Channel | "all") => void;
  channelStats: { channel: Channel; count: number; unread: number }[];
  totalUnread: number;
  integrationStatus?: {
    telegram: {
      configured: boolean;
      connected?: boolean;
      mode: string;
      profile?: { name: string; username?: string } | null;
    };
    max: {
      configured: boolean;
      connected?: boolean;
      mode: string;
      profile?: { name: string; username?: string } | null;
    };
    assignmentStrategy: string;
  } | null;
}

export function AppSidebar({
  activeChannel,
  onChannelChange,
  channelStats,
  totalUnread,
  integrationStatus,
}: AppSidebarProps) {
  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none">HubDesk</p>
          <p className="text-[10px] text-muted-foreground">Омниканальный inbox</p>
        </div>
      </div>

      <Separator />

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.label}
            variant={item.active ? "secondary" : "ghost"}
            className="w-full justify-start gap-2"
            disabled={item.disabled}
            render={!item.disabled && item.href !== "#" ? <Link href={item.href} /> : undefined}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.label === "Входящие" && totalUnread > 0 && (
              <Badge className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px]">
                {totalUnread}
              </Badge>
            )}
          </Button>
        ))}
      </nav>

      <Separator />

      <div className="p-3">
        <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Каналы
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onChannelChange("all")}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
              activeChannel === "all" && "bg-accent font-medium",
            )}
          >
            <span>Все каналы</span>
          </button>
          {channelStats.map(({ channel, count, unread }) => (
            <button
              key={channel}
              type="button"
              onClick={() => onChannelChange(channel)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                activeChannel === channel && "bg-accent font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    channel === "whatsapp" && "bg-emerald-500",
                    channel === "telegram" && "bg-sky-500",
                    channel === "max" && "bg-violet-500",
                    channel === "vk" && "bg-blue-600",
                    channel === "instagram" && "bg-pink-500",
                  )}
                />
                {CHANNEL_CONFIG[channel].label}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {count}
                {unread > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">
                    {unread}
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {integrationStatus && (
        <>
          <Separator />
          <div className="p-3">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Интеграции
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
                <span>Telegram</span>
                <Badge
                  variant={
                    integrationStatus.telegram.connected ? "default" : "secondary"
                  }
                >
                  {integrationStatus.telegram.connected
                    ? integrationStatus.telegram.profile?.name ?? "подключён"
                    : integrationStatus.telegram.configured
                      ? "не подключён"
                      : "не настроен"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
                <span>MAX</span>
                <Badge
                  variant={
                    integrationStatus.max.connected ? "default" : "secondary"
                  }
                >
                  {integrationStatus.max.connected
                    ? integrationStatus.max.profile?.name ?? integrationStatus.max.mode
                    : integrationStatus.max.configured
                      ? "ошибка токена"
                      : "не настроен"}
                </Badge>
              </div>
              <p className="px-1 text-[10px] text-muted-foreground">
                Автораспределение:{" "}
                {integrationStatus.assignmentStrategy === "round_robin"
                  ? "по очереди"
                  : "по нагрузке"}
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
