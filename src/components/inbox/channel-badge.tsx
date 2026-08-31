import type { Channel } from "@/lib/types";
import { CHANNEL_CONFIG } from "@/lib/channels";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<Channel, string> = {
  whatsapp: "WA",
  telegram: "TG",
  vk: "VK",
  instagram: "IG",
};

export function ChannelBadge({
  channel,
  size = "sm",
}: {
  channel: Channel;
  size?: "sm" | "md";
}) {
  const config = CHANNEL_CONFIG[channel];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold",
        config.bg,
        config.color,
        size === "sm" ? "h-5 min-w-5 px-1 text-[10px]" : "h-6 min-w-6 px-1.5 text-xs",
      )}
    >
      {CHANNEL_ICONS[channel]}
    </span>
  );
}

export function ChannelLabel({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChannelBadge channel={channel} />
      <span className="text-xs text-muted-foreground">
        {CHANNEL_CONFIG[channel].label}
      </span>
    </span>
  );
}
