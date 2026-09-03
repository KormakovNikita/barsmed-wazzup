"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Loader2, MessageSquare } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  ALL_CHANNELS,
  CHANNEL_CONFIG,
  CLIENT_STATUS_LABELS,
} from "@/lib/channels";
import type { Channel, ClientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type DialogAnalytics = {
  from: string;
  to: string;
  total: number;
  byChannel: Array<{ channel: Channel; count: number }>;
  byClientStatus: Array<{ status: ClientStatus | "none"; count: number }>;
  vipCount: number;
  daily: Array<{ date: string; count: number }>;
};

const CHANNEL_BAR_COLORS: Record<Channel, string> = {
  whatsapp: "#10b981",
  telegram: "#0ea5e9",
  max: "#8b5cf6",
  max_personal: "#d946ef",
  vk: "#2563eb",
  instagram: "#ec4899",
};

function formatDay(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function statusCount(
  data: DialogAnalytics,
  status: ClientStatus | "none",
): number {
  return data.byClientStatus.find((item) => item.status === status)?.count ?? 0;
}

export function AnalyticsApp() {
  const initial = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<DialogAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/dialogs?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
      );
      const json = (await res.json()) as DialogAnalytics & { error?: string };
      if (!res.ok) throw new Error(json.error || "Не удалось загрузить аналитику");
      setData({
        ...json,
        from: fromDate,
        to: toDate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(from, to);
  }, [from, to, load]);

  const channelEntries = useMemo(() => {
    if (!data) return [];
    const counts = new Map(data.byChannel.map((item) => [item.channel, item.count]));
    return ALL_CHANNELS.map((channel) => ({
      channel,
      count: counts.get(channel) ?? 0,
      meta: CHANNEL_CONFIG[channel],
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  const maxChannel = Math.max(1, ...channelEntries.map((e) => e.count));
  const maxDaily = Math.max(1, ...(data?.daily.map((d) => d.count) ?? [1]));

  return (
    <div className="flex h-dvh flex-col bg-[#f4f7f5]">
      <header className="flex items-center justify-between border-b border-border/60 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-4">
          <BrandLogo href="/inbox" />
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Аналитика
            </h1>
            <p className="text-xs text-muted-foreground">
              Поступившие диалоги по мессенджерам
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href="/inbox" />}>
            Входящие
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/contacts" />}>
            Контакты
          </Button>
        </div>
      </header>

      <div className="border-b border-border/60 bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            С
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            По
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : error ? (
          <div className="mx-auto max-w-5xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : data ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Всего диалогов"
                value={data.total}
                hint={`${data.from} — ${data.to}`}
              />
              <StatCard label="ВИП" value={data.vipCount} hint="с флагом ВИП" />
              <StatCard
                label="Теплые"
                value={statusCount(data, "warm")}
                hint={CLIENT_STATUS_LABELS.warm}
              />
              <StatCard
                label="Записались"
                value={statusCount(data, "booked")}
                hint={CLIENT_STATUS_LABELS.booked}
              />
            </div>

            <section className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">По мессенджерам</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Диалоги, у которых первое входящее сообщение попало в выбранный период
              </p>
              <div className="mt-5 space-y-4">
                {channelEntries.every((e) => e.count === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    За период нет поступивших диалогов.
                  </p>
                ) : (
                  channelEntries.map(({ channel, count, meta }) => (
                    <div
                      key={channel}
                      className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3"
                    >
                      <div className="truncate text-sm font-medium text-foreground">
                        {meta.label}
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(count / maxChannel) * 100}%`,
                            backgroundColor: CHANNEL_BAR_COLORS[channel],
                          }}
                        />
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {count}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">Статусы клиентов</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((status) => (
                  <div
                    key={status}
                    className="rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div className="text-xs text-muted-foreground">
                      {CLIENT_STATUS_LABELS[status]}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {statusCount(data, status)}
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-[#f9a8d4]/40 bg-[#fdf2f8] px-4 py-3">
                  <div className="text-xs font-semibold text-red-600">ВИП</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {data.vipCount}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs text-muted-foreground">Без статуса</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {statusCount(data, "none")}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">По дням</h2>
              </div>
              {data.daily.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Нет данных за период.</p>
              ) : (
                <div
                  className="mt-5 flex items-end gap-1.5 overflow-x-auto pb-2"
                  style={{ minHeight: 160 }}
                >
                  {data.daily.map((day) => (
                    <div
                      key={day.date}
                      className="flex w-10 shrink-0 flex-col items-center gap-1"
                      title={`${day.date}: ${day.count}`}
                    >
                      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                        {day.count || ""}
                      </span>
                      <div className="flex h-28 w-full items-end rounded-t-md bg-muted/50">
                        <div
                          className={cn(
                            "w-full rounded-t-md bg-primary/80 transition-all",
                            day.count === 0 && "bg-transparent",
                          )}
                          style={{ height: `${(day.count / maxDaily) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDay(day.date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
