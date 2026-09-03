import type { Channel } from "@/lib/types";
import { CHANNEL_CONFIG } from "@/lib/channels";
import { ChannelIcon } from "@/components/inbox/channel-icons";
import { cn } from "@/lib/utils";

const AVATAR_BADGE_STYLES: Record<Channel, string> = {
  whatsapp: "bg-[#25D366]",
  telegram: "bg-[#229ED9]",
  max: "bg-transparent",
  max_personal: "bg-transparent ring-fuchsia-400",
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
  const isMax = channel === "max" || channel === "max_personal";

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
  const isMax = channel === "max" || channel === "max_personal";

  const badgeBg: Record<Channel, string> = {
    whatsapp: "bg-[#25D366]",
    telegram: "bg-[#229ED9]",
    max: "",
    max_personal: "",
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

export function ChannelLabel({
  channel,
  href,
}: {
  channel: Channel;
  href?: string;
}) {
  const content = (
    <>
      <ChannelBadge channel={channel} />
      <span className="text-xs text-muted-foreground">
        {CHANNEL_CONFIG[channel].label}
      </span>
    </>
  );

  if (!href) {
    return <span className="inline-flex items-center gap-1.5">{content}</span>;
  }

  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1 transition-colors hover:border-primary/40 hover:bg-primary/5"
      title={`Открыть диалог в ${CHANNEL_CONFIG[channel].label}`}
    >
      {content}
    </a>
  );
}
