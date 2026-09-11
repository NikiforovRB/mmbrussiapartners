"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Cpu, Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

export type HumaxRecord = {
  id: string;
  serial: string;
  password: string;
  comment: string | null;
  createdAt: string;
  dealerEmail?: string | null;
};

function formatRuDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CopyButton({ value, label = "Скопировать" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Скопировано");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn border border-hairline text-ink-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {copied ? <Check className="h-4 w-4 text-[#16803d]" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function HumaxPanel({
  records,
  context,
}: {
  records: HumaxRecord[];
  context: "dealer" | "admin";
}) {
  const router = useRouter();
  const [serial, setSerial] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [latest, setLatest] = React.useState<HumaxRecord | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = serial.trim();
    if (!trimmed) {
      toast.error("Укажите серийный номер ШГУ HUMAX");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/drivemods/hupass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: trimmed, comment: comment.trim() || undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<HumaxRecord> & { error?: string };
      if (!res.ok || !j.password) {
        toast.error(j.error ?? "Не удалось получить пароль");
        return;
      }
      setLatest({
        id: j.id ?? "",
        serial: j.serial ?? trimmed,
        password: j.password,
        comment: j.comment ?? (comment.trim() || null),
        createdAt: j.createdAt ?? new Date().toISOString(),
      });
      toast.success("Пароль HUMAX получен");
      setSerial("");
      setComment("");
      router.refresh();
    } catch {
      toast.error("Ошибка запроса к сервису DRIVEMODS");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Генерация пароля HUMAX</CardTitle>
            <CardDescription>
              Введите серийный номер ШГУ HUMAX — DRIVEMODS вернёт пароль для устройства.
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input
            label="Серийный номер ШГУ HUMAX"
            placeholder="например, HC2ZH01515"
            icon={<Cpu className="h-4 w-4" />}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
          <Input
            label="Комментарий (необязательно)"
            placeholder="имя субдилера или заметка"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
          <Button
            type="submit"
            loading={loading}
            icon={<KeyRound className="h-4 w-4" />}
            className="sm:mb-[1px]"
          >
            Получить пароль
          </Button>
        </form>

        {latest ? (
          <div className="mt-5 rounded-panel border border-accent/40 bg-[#f2f9ff] p-4">
            <div className="flex items-center gap-2 text-[12.5px] text-[#0a78d8]">
              <Sparkles className="h-4 w-4" />
              Пароль для {latest.serial}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-2xl tracking-wide text-ink">{latest.password}</span>
              <CopyButton value={latest.password} label="Скопировать пароль" />
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <div className="font-display text-lg tracking-tight">История паролей</div>
            <div className="text-sm text-ink-muted">
              {context === "admin" ? "Пароли, сгенерированные представителями" : "Ваши сгенерированные пароли"}
            </div>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-ink-muted">
            Пока нет сгенерированных паролей.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[12.5px] text-ink-muted">
                  <th className="px-6 py-3 font-normal">Серийный номер</th>
                  <th className="px-6 py-3 font-normal">Пароль</th>
                  {context === "admin" ? <th className="px-6 py-3 font-normal">Представитель</th> : null}
                  <th className="px-6 py-3 font-normal">Комментарий</th>
                  <th className="px-6 py-3 font-normal">Дата</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-hairline/60 last:border-0">
                    <td className="px-6 py-3">
                      <span className="font-mono text-[13px] text-ink">{r.serial}</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] text-ink">{r.password}</span>
                        <CopyButton value={r.password} label="Скопировать пароль" />
                      </div>
                    </td>
                    {context === "admin" ? (
                      <td className="px-6 py-3 text-ink-muted">{r.dealerEmail ?? "—"}</td>
                    ) : null}
                    <td className="px-6 py-3 text-ink-muted">
                      {r.comment ? r.comment : <Tag tone="muted">—</Tag>}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-ink-muted tabular-nums">
                      {formatRuDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
