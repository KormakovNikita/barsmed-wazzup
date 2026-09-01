"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EMOJI_CATEGORIES } from "@/lib/emoji-data";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);

  const category =
    EMOJI_CATEGORIES.find((item) => item.id === activeCategory) ??
    EMOJI_CATEGORIES[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 self-end"
            disabled={disabled}
            title="Смайлики"
          >
            <Smile className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 p-2"
      >
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {EMOJI_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent",
                activeCategory === item.id && "bg-accent",
              )}
              onClick={() => setActiveCategory(item.id)}
              title={item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
          {category.emojis.map((emoji) => (
            <button
              key={`${category.id}-${emoji}`}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-xl transition-colors hover:bg-accent"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
