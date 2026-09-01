"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, Send, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTemplatePlaceholders,
  extractTemplatePlaceholders,
  templatePreviewLabel,
} from "@/lib/template-utils";

interface MessageTemplate {
  id: string;
  title: string;
  body: string;
}

interface TemplatePickerProps {
  disabled?: boolean;
  contactName?: string;
  onInsert: (text: string) => void;
  onSend?: (text: string) => Promise<void>;
}

export function TemplatePicker({
  disabled,
  contactName,
  onInsert,
  onSend,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open || manageOpen) loadTemplates();
  }, [open, manageOpen, loadTemplates]);

  const placeholders = useMemo(
    () => (selected ? extractTemplatePlaceholders(selected.body) : []),
    [selected],
  );

  const filledText = useMemo(() => {
    if (!selected) return "";
    const merged = { ...values };
    if (!merged.имя?.trim() && contactName?.trim()) {
      merged.имя = contactName.trim();
    }
    return applyTemplatePlaceholders(selected.body, merged);
  }, [selected, values, contactName]);

  function openTemplate(template: MessageTemplate) {
    setOpen(false);
    setSelected(template);
    const keys = extractTemplatePlaceholders(template.body);
    const initial: Record<string, string> = {};
    for (const key of keys) {
      if (key.toLowerCase() === "имя" && contactName?.trim()) {
        initial[key] = contactName.trim();
      } else {
        initial[key] = "";
      }
    }
    setValues(initial);
  }

  function closeFillDialog() {
    setSelected(null);
    setValues({});
  }

  async function handleInsert() {
    if (!filledText.trim()) return;
    onInsert(filledText);
    closeFillDialog();
  }

  async function handleSend() {
    if (!onSend || !filledText.trim()) return;
    setSending(true);
    try {
      await onSend(filledText);
      closeFillDialog();
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteTemplate(id: string, title: string) {
    if (!window.confirm(`Удалить шаблон «${title}»?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Ошибка удаления");
      }
      if (selected?.id === id) closeFillDialog();
      await loadTemplates();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateTemplate() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      setNewTitle("");
      setNewBody("");
      setManageOpen(false);
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 self-end"
              disabled={disabled}
              title="Шаблоны сообщений"
            >
              <FileText className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-80 p-2"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-medium">Шаблоны</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                setOpen(false);
                setManageOpen(true);
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Управление
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Загрузка…
            </div>
          ) : templates.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">
              Шаблонов пока нет
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-start gap-1 rounded-md hover:bg-accent"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-2 py-2 text-left"
                    onClick={() => openTemplate(template)}
                  >
                    <p className="text-sm font-medium">{template.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {templatePreviewLabel(template.title, template.body)}
                    </p>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === template.id}
                    title="Удалить шаблон"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteTemplate(template.id, template.title);
                    }}
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next) closeFillDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "Шаблон"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {placeholders.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Заполните поля — они подставятся в текст шаблона.
                </p>
                {placeholders.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`tpl-${key}`}>{key}</Label>
                    <Input
                      id={`tpl-${key}`}
                      value={values[key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={`Введите ${key}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                В этом шаблоне нет полей для заполнения.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Предпросмотр</Label>
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {filledText || "—"}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeFillDialog}>
              Отмена
            </Button>
            <Button type="button" variant="secondary" onClick={handleInsert}>
              Вставить в поле
            </Button>
            {onSend && (
              <Button
                type="button"
                onClick={handleSend}
                disabled={sending || !filledText.trim()}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Отправить
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Управление шаблонами</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>Текущие шаблоны</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{template.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {templatePreviewLabel(template.title, template.body)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={deletingId === template.id}
                        title="Удалить"
                        onClick={() =>
                          void handleDeleteTemplate(template.id, template.title)
                        }
                      >
                        {deletingId === template.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3 border-t pt-4">
              <Label>Новый шаблон</Label>
              <p className="text-sm text-muted-foreground">
                Используйте поля в фигурных скобках, например{" "}
                <code className="text-xs">{"{имя}"}</code>,{" "}
                <code className="text-xs">{"{дата}"}</code>,{" "}
                <code className="text-xs">{"{время}"}</code>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new-template-title">Название</Label>
                <Input
                  id="new-template-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Подтверждение записи"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-template-body">Текст</Label>
                <Textarea
                  id="new-template-body"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  placeholder="Добрый день, {имя}! Запись на {дата} в {время} подтверждена."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={handleCreateTemplate}
              disabled={saving || !newTitle.trim() || !newBody.trim()}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Сохранить шаблон
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
