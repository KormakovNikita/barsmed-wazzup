"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
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

interface TemplateAttachment {
  id: string;
  templateId: string;
  type: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  url: string;
}

interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  attachments: TemplateAttachment[];
}

interface TemplatePickerProps {
  disabled?: boolean;
  contactName?: string;
  onInsert: (text: string, file?: File) => void;
  onSend?: (text: string, file?: File) => Promise<void>;
}

function attachmentLabel(attachment: TemplateAttachment): string {
  if (attachment.type === "image") return "📷 Изображение";
  if (attachment.type === "video") return "🎬 Видео";
  if (attachment.type === "audio" || attachment.type === "voice") {
    return "🎵 Аудио";
  }
  return attachment.fileName ? `📎 ${attachment.fileName}` : "📎 Файл";
}

async function fetchTemplateAttachmentAsFile(
  attachment: TemplateAttachment,
): Promise<File> {
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error("Не удалось загрузить вложение шаблона");
  const blob = await res.blob();
  return new File(
    [blob],
    attachment.fileName ?? "file",
    { type: attachment.mimeType ?? blob.type },
  );
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
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(
    null,
  );
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const remainingAttachments = useMemo(() => {
    if (!editingTemplate) return [];
    return editingTemplate.attachments.filter(
      (attachment) => !removedAttachmentIds.includes(attachment.id),
    );
  }, [editingTemplate, removedAttachmentIds]);

  function resetManageForm() {
    setEditingTemplate(null);
    setFormTitle("");
    setFormBody("");
    setFormFiles([]);
    setRemovedAttachmentIds([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openManageDialog(template?: MessageTemplate) {
    setOpen(false);
    if (template) {
      setEditingTemplate(template);
      setFormTitle(template.title);
      setFormBody(template.body);
    } else {
      resetManageForm();
    }
    setManageOpen(true);
  }

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

  async function resolveTemplateFiles(
    template: MessageTemplate,
  ): Promise<File[]> {
    const files: File[] = [];
    for (const attachment of template.attachments) {
      files.push(await fetchTemplateAttachmentAsFile(attachment));
    }
    return files;
  }

  async function handleInsert() {
    if (!selected) return;
    const files = await resolveTemplateFiles(selected);
    if (filledText.trim() || files.length > 0) {
      onInsert(filledText, files[0]);
    }
    closeFillDialog();
  }

  async function handleSend() {
    if (!onSend || !selected) return;
    if (!filledText.trim() && selected.attachments.length === 0) return;

    setSending(true);
    try {
      const files = await resolveTemplateFiles(selected);
      if (files.length === 0) {
        await onSend(filledText);
      } else {
        for (let index = 0; index < files.length; index += 1) {
          await onSend(index === 0 ? filledText : "", files[index]);
        }
      }
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
      if (editingTemplate?.id === id) resetManageForm();
      await loadTemplates();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveTemplate() {
    if (!formTitle.trim()) return;
    if (!formBody.trim() && formFiles.length === 0 && remainingAttachments.length === 0) {
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("title", formTitle.trim());
      formData.append("body", formBody);

      if (editingTemplate) {
        for (const attachmentId of removedAttachmentIds) {
          formData.append("removeAttachmentIds", attachmentId);
        }
        for (const file of formFiles) {
          formData.append("file", file);
        }

        const res = await fetch(`/api/templates/${editingTemplate.id}`, {
          method: "PATCH",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      } else {
        for (const file of formFiles) {
          formData.append("file", file);
        }

        const res = await fetch("/api/templates", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");
      }

      resetManageForm();
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
              onClick={() => openManageDialog()}
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
                      {template.attachments.length > 0 &&
                        ` · ${template.attachments.length} файл(ов)`}
                    </p>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    disabled={deletingId === template.id}
                    title="Редактировать"
                    onClick={(e) => {
                      e.stopPropagation();
                      openManageDialog(template);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
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
            {selected && selected.attachments.length > 0 && (
              <div className="space-y-1.5">
                <Label>Вложения</Label>
                <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                  {selected.attachments.map((attachment) => (
                    <p key={attachment.id} className="text-sm">
                      {attachmentLabel(attachment)}
                    </p>
                  ))}
                </div>
              </div>
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
                disabled={
                  sending ||
                  (!filledText.trim() && (selected?.attachments.length ?? 0) === 0)
                }
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

      <Dialog
        open={manageOpen}
        onOpenChange={(next) => {
          setManageOpen(next);
          if (!next) resetManageForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Редактировать шаблон" : "Новый шаблон"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {templates.length > 0 && !editingTemplate && (
              <div className="space-y-2">
                <Label>Текущие шаблоны</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{template.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {templatePreviewLabel(template.title, template.body)}
                          {template.attachments.length > 0 &&
                            ` · ${template.attachments.length} файл(ов)`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Редактировать"
                        onClick={() => openManageDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Используйте поля в фигурных скобках, например{" "}
                <code className="text-xs">{"{имя}"}</code>,{" "}
                <code className="text-xs">{"{дата}"}</code>,{" "}
                <code className="text-xs">{"{время}"}</code>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="template-title">Название</Label>
                <Input
                  id="template-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Подтверждение записи"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-body">Текст</Label>
                <Textarea
                  id="template-body"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={5}
                  placeholder="Добрый день, {имя}! Запись на {дата} в {время} подтверждена."
                />
              </div>

              <div className="space-y-2">
                <Label>Вложения</Label>
                {remainingAttachments.length > 0 && (
                  <div className="space-y-1 rounded-md border p-2">
                    {remainingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {attachmentLabel(attachment)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Убрать вложение"
                          onClick={() =>
                            setRemovedAttachmentIds((prev) =>
                              prev.includes(attachment.id)
                                ? prev
                                : [...prev, attachment.id],
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {formFiles.length > 0 && (
                  <div className="space-y-1 rounded-md border border-dashed p-2">
                    {formFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          📎 {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Убрать файл"
                          onClick={() =>
                            setFormFiles((prev) =>
                              prev.filter((_, fileIndex) => fileIndex !== index),
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) {
                      setFormFiles((prev) => [...prev, ...files]);
                    }
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  Прикрепить файл
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManageOpen(false);
                resetManageForm();
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={handleSaveTemplate}
              disabled={
                saving ||
                !formTitle.trim() ||
                (!formBody.trim() &&
                  formFiles.length === 0 &&
                  remainingAttachments.length === 0)
              }
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : editingTemplate ? (
                <Pencil className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingTemplate ? "Сохранить изменения" : "Создать шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
