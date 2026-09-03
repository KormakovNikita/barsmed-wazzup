"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { ChannelLabel } from "@/components/inbox/channel-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Contact } from "@/lib/types";

export function ContactsApp() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить контакты");
      setContacts(data.contacts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  async function handleCreate() {
    if (!name.trim()) {
      setCreateError("Укажите имя");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать контакт");
      setCreateOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      setCompany("");
      setNotes("");
      await loadContacts();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[#f4f7f5]">
      <header className="flex items-center justify-between border-b border-border/60 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-4">
          <BrandLogo href="/inbox" />
          <div>
            <h1 className="text-base font-semibold">Контакты</h1>
            <p className="text-xs text-muted-foreground">
              Имена, телефоны и мессенджеры клиентов
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href="/inbox" />}>
            Входящие
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Новый контакт
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый контакт</DialogTitle>
                <DialogDescription>
                  Сохраните клиента под своим именем. Мессенджеры появятся, когда
                  появятся диалоги.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-name">Имя *</Label>
                  <Input
                    id="new-contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Диана (Гаврилова)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-phone">Телефон</Label>
                  <Input
                    id="new-contact-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 900 000-00-00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-email">Email</Label>
                  <Input
                    id="new-contact-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-company">Компания</Label>
                  <Input
                    id="new-contact-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-notes">Заметки</Label>
                  <Textarea
                    id="new-contact-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive">{createError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={saving}
                >
                  Отмена
                </Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Сохранить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по имени, телефону, мессенджеру…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-auto rounded-2xl border border-border/60 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Загрузка…
            </div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Users className="h-8 w-8 opacity-50" />
              <p className="text-sm">Контактов пока нет</p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setCreateOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Добавить контакт
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <ContactAvatar name={contact.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{contact.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {contact.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.company && <span>{contact.company}</span>}
                      </div>
                      {contact.notes && (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {contact.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {contact.channels?.length ? (
                      contact.channels.map((channel) => {
                        const conversationId =
                          contact.channelConversations?.[channel];
                        return (
                          <ChannelLabel
                            key={channel}
                            channel={channel}
                            href={
                              conversationId
                                ? `/inbox?conversation=${encodeURIComponent(conversationId)}`
                                : undefined
                            }
                          />
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Нет мессенджеров
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
