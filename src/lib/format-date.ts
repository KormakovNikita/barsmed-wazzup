import {
  format,
  isSameYear,
  isToday,
  isYesterday,
} from "date-fns";
import { ru } from "date-fns/locale";

export function formatMessageDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Date label above message groups: «Сегодня», «Вчера», «31 августа». */
export function formatMessageDateLabel(date: Date): string {
  if (isToday(date)) return "Сегодня";
  if (isYesterday(date)) return "Вчера";
  if (isSameYear(date, new Date())) {
    return format(date, "d MMMM", { locale: ru });
  }
  return format(date, "d MMMM yyyy", { locale: ru });
}

/** Compact timestamp in the conversation list. */
export function formatConversationTime(date: Date): string {
  if (isToday(date)) return format(date, "HH:mm", { locale: ru });
  if (isYesterday(date)) return "Вчера";
  if (isSameYear(date, new Date())) {
    return format(date, "d MMM", { locale: ru });
  }
  return format(date, "d.MM.yy", { locale: ru });
}
