"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type LoginNoticeItem = { id: string; title: string; body: string };

/**
 * Показывает при входе непрочитанные уведомления, требующие подтверждения
 * «Ознакомился». Окно блокирующее: нет крестика, клика по фону и Escape —
 * закрыть можно только кнопкой, которая фиксирует ознакомление на сервере.
 */
export function LoginNoticeGate({ notices }: { notices: LoginNoticeItem[] }) {
  const [queue, setQueue] = React.useState<LoginNoticeItem[]>(notices);
  const [loading, setLoading] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const current = queue[0];

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!current) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [current]);

  if (!current || !mounted) return null;

  async function acknowledge() {
    if (!current) return;
    setLoading(true);
    const res = await fetch(`/api/notices/${current.id}/ack`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      toast.error("Не удалось сохранить подтверждение");
      return;
    }
    setQueue((q) => q.slice(1));
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-[#06121f]/70" />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-clean bg-white border border-hairline rounded-panel p-6 animate-modal-in"
        style={{ boxShadow: "0 32px 80px -24px rgba(11,16,32,0.35)" }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <span className="grid h-9 w-9 place-items-center rounded-btn bg-accent/10 text-accent">
            <BellRing className="h-4.5 w-4.5" />
          </span>
          <h2 className="font-display text-xl tracking-tight">{current.title}</h2>
        </div>
        <div className="text-sm text-ink-muted whitespace-pre-line leading-relaxed">{current.body}</div>
        {queue.length > 1 ? (
          <div className="mt-4 text-xs text-ink-subtle">Ещё уведомлений: {queue.length - 1}</div>
        ) : null}
        <div className="mt-6 flex justify-end">
          <Button onClick={acknowledge} loading={loading}>
            Ознакомился
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
