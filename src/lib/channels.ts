import type { Channel } from "./types";

export const CHANNEL_CONFIG: Record<
  Channel,
  { label: string; color: string; bg: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
  },
  telegram: {
    label: "Telegram",
    color: "text-sky-700",
    bg: "bg-sky-100",
  },
  max: {
    label: "MAX",
    color: "text-violet-700",
    bg: "bg-violet-100",
  },
  vk: {
    label: "VK",
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-700",
    bg: "bg-pink-100",
  },
};

export const ALL_CHANNELS: Channel[] = [
  "whatsapp",
  "telegram",
  "max",
  "vk",
  "instagram",
];

export const DEAL_STAGE_LABELS: Record<string, string> = {
  new: "Новый лид",
  negotiation: "Переговоры",
  proposal: "Счёт отправлен",
  won: "Сделка закрыта",
  lost: "Отказ",
};
