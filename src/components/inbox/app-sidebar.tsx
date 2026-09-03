"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Inbox,
  Settings,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CHANNEL_CONFIG } from "@/lib/channels";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: Inbox, label: "Входящие", href: "/inbox", disabled: false },
  { icon: Users, label: "Контакты", href: "/contacts", disabled: false },
  { icon: BarChart3, label: "Аналитика", href: "/analytics", disabled: false },
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
    maxPersonal?: {
      enabled: boolean;
      configured: boolean;
      connected?: boolean;
      profile?: { name?: string } | null;
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
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
      <div className="px-4 py-5">
        <BrandLogo href="/inbox" />
        <p className="mt-2 text-[10px] text-muted-foreground">Входящие сообщения</p>
      </div>

      <Separator className="opacity-60" />

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            !item.disabled &&
            item.href !== "#" &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
          <Button
            key={item.label}
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "h-10 w-full justify-start gap-2.5 rounded-xl",
              isActive && "bg-primary/10 font-medium text-primary shadow-none",
            )}
            disabled={item.disabled}
            render={!item.disabled && item.href !== "#" ? <Link href={item.href} /> : undefined}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.label === "Входящие" && totalUnread > 0 && (
              <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
                {totalUnread}
              </Badge>
            )}
          </Button>
          );
        })}
      </nav>

      <Separator className="opacity-60" />

      <div className="p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Каналы
        </p>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onChannelChange("all")}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-accent",
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
                "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-accent",
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
                    channel === "max_personal" && "bg-fuchsia-500",
                    channel === "vk" && "bg-blue-600",
                    channel === "instagram" && "bg-pink-500",
                  )}
                />
                {CHANNEL_CONFIG[channel].label}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {count}
                {unread > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[9px]">
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
          <Separator className="opacity-60" />
          <div className="p-3">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Статус
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-2.5 py-2">
                <span>Telegram</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    integrationStatus.telegram.connected
                      ? "bg-brand-light"
                      : "bg-muted-foreground/40",
                  )}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-2.5 py-2">
                <span>MAX</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    integrationStatus.max.connected
                      ? "bg-brand-light"
                      : "bg-muted-foreground/40",
                  )}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-2.5 py-2">
                <span>MAX Personal</span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    integrationStatus.maxPersonal?.connected
                      ? "bg-brand-light"
                      : "bg-muted-foreground/40",
                  )}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
