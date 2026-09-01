import type { Channel } from "@/lib/types";
import { CHANNEL_CONFIG } from "@/lib/channels";
import { ChannelIcon } from "@/components/inbox/channel-icons";
import { cn } from "@/lib/utils";

const AVATAR_BADGE_STYLES: Record<Channel, string> = {
  whatsapp: "bg-[#25D366]",
  telegram: "bg-[#229ED9]",
  max: "bg-transparent",
  vk: "bg-[#0077FF]",
  instagram: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
};

export function ChannelAvatarBadge({
  channel,
  className,
}: {
  channel: Channel;
  className?: string;
}) {
  const isMax = channel === "max";

  return (
    <span
      className={cn(
        "inline-flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full ring-2 ring-card shadow-sm",
        AVATAR_BADGE_STYLES[channel],
        className,
      )}
      title={CHANNEL_CONFIG[channel].label}
    >
      <ChannelIcon
        channel={channel}
        variant={isMax ? "brand" : "glyph"}
        className={cn(
          isMax ? "h-[18px] w-[18px]" : "h-2.5 w-2.5 text-white",
        )}
      />
    </span>
  );
}

export function ChannelBadge({
  channel,
  size = "sm",
}: {
  channel: Channel;
  size?: "sm" | "md";
}) {
  const config = CHANNEL_CONFIG[channel];
  const boxSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const isMax = channel === "max";

  const badgeBg: Record<Channel, string> = {
    whatsapp: "bg-[#25D366]",
    telegram: "bg-[#229ED9]",
    max: "",
    vk: "bg-[#0077FF]",
    instagram: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-md",
        isMax ? boxSize : cn(badgeBg[channel], boxSize),
      )}
      title={config.label}
    >
      <ChannelIcon
        channel={channel}
        variant={isMax ? "brand" : "glyph"}
        className={cn(
          isMax ? boxSize : iconSize,
          isMax ? "" : "text-white",
        )}
      />
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
