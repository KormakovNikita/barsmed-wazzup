"use client";

import { cn } from "@/lib/utils";
import { getAvatarPalette, getInitials } from "@/lib/avatar-colors";

interface ContactAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-lg",
};

export function ContactAvatar({
  name,
  size = "sm",
  className,
}: ContactAvatarProps) {
  const palette = getAvatarPalette(name);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold ring-2",
        SIZE_CLASSES[size],
        palette.bg,
        palette.text,
        palette.ring,
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
