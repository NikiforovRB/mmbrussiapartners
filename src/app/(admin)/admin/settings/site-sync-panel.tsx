"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, SearchCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { formatRuDateTime } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";
import { fioFromParts } from "@/lib/utils";
import {
  SITE_ACTION_LABEL,
  SITE_RESULT_LABEL,
  SITE_TRIGGER_LABEL,
  formatSiteSummary,
} from "@/lib/site-sync-labels";
import type { SiteSyncLogEntry, SiteSyncOverview } from "@/lib/site-dealers";

type RunResult = {
  ok: boolean;
  dryRun: boolean;
  dealers: number;
  error: string | null;
  summary: Record<string, number> | null;
  warnings: string[];
  results: { externalId: string; status: string; city?: string | null; phone?: string | null; message?: string | null }[];
};

export function SiteSyncPanel({ overview }: { overview: SiteSyncOverview }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canRun = can("dealers.approve");
  const [busy, setBusy] = React.useState<"dry" | "real" | null>(null);
  const [result, setResult] = React.useState<RunResult | null>(null);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "real");
    const res = await fetch("/api/settings/site-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun }),
    });
    setBusy(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Не удалось выполнить сверку");
      return;
    }
    const r = { ...(j.result as Omit<RunResult, "dryRun">), dryRun };
    setResult(r);
    if (r.ok) toast.success(dryRun ? "Проверка выполнена, на сайте ничего не изменилось" : "Сверка выполнена");
    else toast.error(r.error ?? "Сайт не принял запрос");
    router.refresh();
  }

  const last = overview.lastSync;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="font-display text-lg  tracking-tight">Дилерская сеть на сайте</div>
          {overview.configured ? (
            <Tag tone="success">Подключено</Tag>
          ) : (
            <Tag tone="danger">Не настроено</Tag>
          )}
        </div>
        <p className="text-sm text-ink-muted">
          Одобренные телефоны представителей публикуются в «Дилерской сети» на{" "}
          <a
            href={`${overview.siteUrl ?? "https://mmbrussia.ru"}/contacts`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            {(overview.siteUrl ?? "https://mmbrussia.ru").replace(/^https?:\/\//, "")}/contacts
          </a>
          . Изменения уходят сразу, неудачные отправки повторяются через 1, 5 и 30 минут, а раз в
          сутки кабинет сверяет весь список.
        </p>
        {!overview.configured ? (
          <p className="mt-3 text-sm text-danger">
            Задайте MMB_SITE_URL и MMB_DEALERS_SYNC_SECRET в .env на сервере и перезапустите кабинет.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-panel border border-hairline p-3">
            <div className="text-xs text-ink-muted">Опубликовано</div>
            <div className="font-display text-2xl tracking-tightest">{overview.published}</div>
          </div>
          <Link
            href="/admin/dealers?pub=PENDING"
            className="rounded-panel border border-hairline p-3 transition-colors hover:border-accent"
          >
            <div className="flex items-center justify-between text-xs text-ink-muted">
              Заявок на рассмотрении <ChevronRight className="h-3.5 w-3.5" />
            </div>
            <div className="font-display text-2xl tracking-tightest">{overview.pending}</div>
          </Link>
        </div>

        <div className="mt-5 text-sm">
          <div className="text-xs uppercase tracking-tight text-ink-subtle mb-2">Последняя сверка</div>
          {last ? <LogDetails entry={last} /> : <div className="text-ink-muted">Ещё не выполнялась</div>}
        </div>

        {canRun && overview.configured ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={busy === "dry"}
              disabled={busy !== null}
              icon={<SearchCheck className="h-4 w-4" />}
              onClick={() => void run(true)}
            >
              Проверить без изменений
            </Button>
            <Button
              loading={busy === "real"}
              disabled={busy !== null}
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void run(false)}
            >
              Синхронизировать сейчас
            </Button>
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-panel border border-hairline p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={result.ok ? "success" : "danger"}>{result.ok ? "Успешно" : "Ошибка"}</Tag>
              {result.dryRun ? <Tag tone="muted">Проверка, без изменений</Tag> : null}
              <span className="text-xs text-ink-muted">Представителей в запросе: {result.dealers}</span>
            </div>
            {result.error ? <div className="text-danger">{result.error}</div> : null}
            {formatSiteSummary(result.summary) ? (
              <div className="text-ink-muted">{formatSiteSummary(result.summary)}</div>
            ) : null}
            <Warnings items={result.warnings} />
            {result.results.length > 0 ? (
              <ul className="text-xs space-y-1">
                {result.results.map((r) => (
                  <li key={`${r.externalId}-${r.status}`} className={r.status === "conflict" || r.status === "error" ? "text-danger" : "text-ink-muted"}>
                    {SITE_RESULT_LABEL[r.status] ?? r.status}: {r.city ?? "—"}, {r.phone ?? "—"}
                    {r.message ? ` — ${r.message}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {overview.problems.length > 0 ? (
          <div className="mt-5">
            <div className="text-xs uppercase tracking-tight text-ink-subtle mb-2">Требуют внимания</div>
            <ul className="space-y-2 text-sm">
              {overview.problems.map((p) => (
                <li key={p.userId}>
                  <Link href={`/admin/dealers/${p.userId}`} className="text-accent hover:underline">
                    {fioFromParts(p) || "Представитель"}
                  </Link>
                  <span className="text-ink-muted">
                    {p.city ? `, ${p.city}` : ""} — {SITE_RESULT_LABEL[p.siteSyncStatus ?? ""] ?? p.siteSyncStatus}
                    {p.siteSyncMessage ? `: ${p.siteSyncMessage}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="font-display text-lg  tracking-tight mb-4">Журнал обмена</div>
        {overview.recent.length === 0 ? (
          <div className="text-sm text-ink-muted">Обменов с сайтом ещё не было</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {overview.recent.map((e) => (
              <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                <LogDetails entry={e} compact />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LogDetails({ entry, compact = false }: { entry: SiteSyncLogEntry; compact?: boolean }) {
  const summary = formatSiteSummary(entry.summary);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={entry.ok ? "text-ink" : "text-danger"}>
          {SITE_ACTION_LABEL[entry.action] ?? entry.action}
          {entry.action === "sync" && entry.dealers > 0 ? ` (${entry.dealers})` : ""}
        </span>
        <span className="text-xs text-ink-muted">
          {SITE_TRIGGER_LABEL[entry.trigger] ?? entry.trigger} · {formatRuDateTime(entry.createdAt)}
        </span>
        {entry.dryRun ? <Tag tone="muted">проверка</Tag> : null}
        {!entry.ok ? <Tag tone="danger">ошибка</Tag> : null}
      </div>
      {entry.error ? <div className="text-xs text-danger">{entry.error}</div> : null}
      {summary ? <div className="text-xs text-ink-muted">{summary}</div> : null}
      {!compact ? <Warnings items={entry.warnings} /> : null}
      {entry.problems.length > 0 ? (
        <ul className="text-xs text-danger space-y-0.5">
          {entry.problems.slice(0, compact ? 3 : 20).map((p) => (
            <li key={`${p.externalId}-${p.status}`}>
              {SITE_RESULT_LABEL[p.status] ?? p.status}: {p.city ?? "—"}, {p.phone ?? "—"}
              {p.message ? ` — ${p.message}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="text-xs text-[#a16207] space-y-0.5">
      {items.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}
