import { Suspense } from "react";
import { InboxApp } from "@/components/inbox/inbox-app";

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Загрузка…</div>}>
      <InboxApp />
    </Suspense>
  );
}
