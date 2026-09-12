"use client";

import * as React from "react";
import { Calendar, Download, FileSpreadsheet, Users, Search, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { addDays, addMonths, formatRuDate } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";
import { LICENSE_KIND_FILTER_OPTIONS } from "@/lib/license-options";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "today", label: "Сегодня", days: 0 },
  { id: "7d", label: "7 дней", days: 7 },
  { id: "30d", label: "30 дней", days: 30 },
  { id: "90d", label: "Квартал", days: 90 },
  { id: "365d", label: "Год", days: 365 },
] as const;

export type ReportDealerOption = { id: string; label: string; sub?: string };

type PreviewRow = {
  id: string;
  number: string;
  kind: string;
  product: string;
  versionCustom: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  dealer: string;
  region: string;
  city: string;
};

export function ReportsBuilder({
  context,
  dealers = [],
}: {
  context: "dealer" | "admin";
  dealers?: ReportDealerOption[];
}) {
  const { can } = usePermissions();
  const canExport = context === "dealer" || can("reports.export");
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: addDays(new Date(), -29),
    to: new Date(),
  }));
  const [status, setStatus] = React.useState<string>("");
  const [type, setType] = React.useState<string>("");
  const [dealerIds, setDealerIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Экранный просмотр отчёта — показываем данные сразу, без ожидания экспорта.
  const [rows, setRows] = React.useState<PreviewRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [limit, setLimit] = React.useState(100);
  const [previewLoading, setPreviewLoading] = React.useState(true);

  function applyPreset(days: number) {
    const to = new Date();
    const from = days === 0 ? new Date(to.getFullYear(), to.getMonth(), to.getDate()) : addDays(to, -days);
    setRange({ from, to });
  }

  const body = React.useMemo(
    () => ({
      from: range.from ? range.from.toISOString() : null,
      to: range.to ? range.to.toISOString() : null,
      status: status || null,
      type: type || null,
      dealerIds: context === "admin" ? dealerIds : undefined,
      scope: context,
    }),
    [range.from, range.to, status, type, dealerIds, context],
  );

  // Дебаунс запросов предпросмотра при смене фильтров.
  React.useEffect(() => {
    if (!body.from || !body.to) return;
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/reports/licenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, preview: true }),
        });
        if (!res.ok) {
          if (!cancelled) {
            setRows([]);
            setCount(0);
          }
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setRows(j.rows ?? []);
          setCount(j.count ?? 0);
          setLimit(j.limit ?? 100);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setCount(0);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body]);

  async function exportXlsx() {
    if (!range.from || !range.to) {
      toast.error("Выберите период");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/reports/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, preview: false }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    const j = await res.json();
    if (j.url) {
      const a = document.createElement("a");
      a.href = j.url;
      a.download = `mmb-licenses-${Date.now()}.xlsx`;
      a.click();
      toast.success("Отчёт сформирован");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="font-display text-lg tracking-tight mb-4">Параметры отчёта</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Статус"
              value={status}
              onChange={(v) => setStatus(v)}
              placeholder="Все"
              options={[
                { value: "", label: "Все" },
                { value: "ACTIVE", label: "Активные" },
                { value: "EXPIRED", label: "Истекли" },
                { value: "CANCELLED", label: "Аннулированы" },
                { value: "REVOKED", label: "Отозваны" },
              ]}
            />
            <Select
              label="Тип лицензии"
              value={type}
              onChange={(v) => setType(v)}
              placeholder="Все типы лицензий"
              options={LICENSE_KIND_FILTER_OPTIONS}
            />
          </div>
          {context === "admin" ? (
            <div className="mt-3">
              <DealerMultiSelect options={dealers} value={dealerIds} onChange={setDealerIds} />
            </div>
          ) : null}
          <div className="mt-3">
            <DateRangePicker value={range} onChange={setRange} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-btn border border-hairline px-3.5 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-col items-end gap-1.5">
            <Button
              loading={loading}
              disabled={!canExport}
              title={canExport ? undefined : "Нет права на экспорт отчётов"}
              onClick={exportXlsx}
              icon={<Download className="h-4 w-4" />}
            >
              Скачать XLSX
            </Button>
            {context === "admin" && !canExport ? (
              <span className="text-xs text-ink-muted">Требуется право «Экспорт отчётов»</span>
            ) : null}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="h-4 w-4 text-accent" />
            <div className="font-display tracking-tight">Итог</div>
          </div>
          <div className="space-y-2 text-sm">
            <Line icon={<Calendar className="h-3.5 w-3.5" />} label="Период">
              {range.from && range.to
                ? `${formatRuDate(range.from)} — ${formatRuDate(range.to)}`
                : "—"}
            </Line>
            <Line label="Статус">{statusFilterLabel(status)}</Line>
            <Line label="Тип лицензии">{type ? kindLabel(type) : "Все типы"}</Line>
            {context === "admin" ? (
              <Line label="Представители">
                {dealerIds.length === 0 ? "Все" : `Выбрано: ${dealerIds.length}`}
              </Line>
            ) : null}
            <div className="divider my-3" />
            <Line label="Найдено лицензий">
              <span className="font-display text-lg">{previewLoading ? "…" : count}</span>
            </Line>
          </div>
          <div className="divider my-4" />
          <div className="text-xs text-ink-muted">
            Файл сохраняется в защищённое хранилище и доступен по подписанной ссылке в течение 5 минут.
          </div>
        </Card>
      </div>

      <ReportPreview rows={rows} count={count} limit={limit} loading={previewLoading} showDealer={context === "admin"} />
    </div>
  );
}

function ReportPreview({
  rows,
  count,
  limit,
  loading,
  showDealer,
}: {
  rows: PreviewRow[];
  count: number;
  limit: number;
  loading: boolean;
  showDealer: boolean;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-hairline">
        <div className="font-display tracking-tight">Предпросмотр</div>
        <div className="text-xs text-ink-muted">
          {loading
            ? "Загрузка…"
            : count > limit
              ? `Показаны первые ${limit} из ${count}`
              : `Строк: ${count}`}
        </div>
      </div>

      {/* Мобильные карточки */}
      <ul className="md:hidden divide-y divide-hairline">
        {rows.length === 0 && !loading ? (
          <li className="px-5 py-12 text-center text-ink-muted text-sm">Ничего не найдено</li>
        ) : null}
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[13px]">{r.number}</div>
              <StatusTag kind="license" status={r.status} />
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {r.kind}
              {r.product ? ` · ${r.product}` : ""}
            </div>
            {showDealer ? <div className="mt-1 text-xs text-ink-muted">{r.dealer}</div> : null}
            <div className="mt-1 text-xs text-ink-subtle">
              {r.createdAt}
              {r.city ? ` · ${r.city}` : ""}
            </div>
          </li>
        ))}
      </ul>

      {/* Десктоп-таблица */}
      <div className="hidden md:block overflow-x-auto scrollbar-clean">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
              <th className="px-5 py-3">Номер</th>
              <th className="px-5 py-3">Тип</th>
              <th className="px-5 py-3">Продукт</th>
              {showDealer ? <th className="px-5 py-3">Представитель</th> : null}
              <th className="px-5 py-3">Статус</th>
              <th className="px-5 py-3">Создана</th>
              <th className="px-5 py-3">Город</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={showDealer ? 7 : 6} className="px-5 py-12 text-center text-ink-muted">
                  Ничего не найдено
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-surface-muted">
                <td className="px-5 py-3 font-mono text-[13px]">{r.number}</td>
                <td className="px-5 py-3 text-ink-muted">{r.kind}</td>
                <td className="px-5 py-3 text-ink-muted">{r.product || "—"}</td>
                {showDealer ? <td className="px-5 py-3 text-ink-muted">{r.dealer}</td> : null}
                <td className="px-5 py-3">
                  <StatusTag kind="license" status={r.status} />
                </td>
                <td className="px-5 py-3 text-ink-muted">{r.createdAt}</td>
                <td className="px-5 py-3 text-ink-muted">{r.city || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DealerMultiSelect({
  options,
  value,
  onChange,
}: {
  options: ReportDealerOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const summary =
    value.length === 0
      ? "Все представители"
      : value.length === 1
        ? options.find((o) => o.id === value[0])?.label ?? "1 выбран"
        : `Выбрано: ${value.length}`;

  return (
    <div className="relative" ref={ref}>
      <label className="block text-[12.5px] text-ink-muted mb-1.5">Представители</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-panel border border-hairline bg-white px-4 h-12 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-ink-subtle shrink-0" />
          <span className={cn("truncate text-[14.5px]", value.length === 0 && "text-ink-subtle")}>
            {summary}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1.5 w-full rounded-panel border border-hairline bg-white shadow-lg">
          {/* Первая строка — быстрый поиск */}
          <div className="flex items-center gap-2 border-b border-hairline px-3 h-11">
            <Search className="h-4 w-4 text-ink-subtle shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск представителя…"
              className="w-full bg-transparent text-sm placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => onChange(filtered.map((o) => o.id))}
              className="text-accent hover:underline"
            >
              Выбрать все
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-ink-muted hover:text-danger hover:underline"
            >
              Сбросить
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-clean py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">Не найдено</div>
            ) : (
              filtered.map((o) => {
                const checked = value.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-btn transition-colors",
                        checked ? "bg-accent text-white" : "border border-hairline bg-white",
                      )}
                    >
                      {checked ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{o.label}</span>
                      {o.sub ? <span className="block truncate text-xs text-ink-muted">{o.sub}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusFilterLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Активные";
    case "EXPIRED":
      return "Истекли";
    case "CANCELLED":
      return "Аннулированы";
    case "REVOKED":
      return "Отозваны";
    default:
      return "Все";
  }
}

function kindLabel(type: string) {
  return LICENSE_KIND_FILTER_OPTIONS.find((o) => o.value === type)?.label ?? "Все типы";
}

function Line({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-ink-muted flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="">{children}</div>
    </div>
  );
}

void addMonths;
