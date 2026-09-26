"use client";

import * as React from "react";
import Link from "next/link";
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Users,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  Columns3,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { addDays, formatRuDate } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import { LICENSE_KIND_FILTER_OPTIONS } from "@/lib/license-options";
import { LICENSE_STATUS_FILTER_OPTIONS } from "@/lib/status-labels";
import {
  defaultColumnState,
  normalizeColumnState,
  reportColumn,
  type ReportColumnKey,
  type ReportColumnState,
  type ReportRow,
} from "@/lib/report-columns";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "today", label: "Сегодня", days: 0 },
  { id: "7d", label: "7 дней", days: 7 },
  { id: "30d", label: "30 дней", days: 30 },
  { id: "90d", label: "Квартал", days: 90 },
  { id: "365d", label: "Год", days: 365 },
] as const;

export type ReportDealerOption = { id: string; label: string; sub?: string };

type Totals = { price: number; basePrice?: number };

const columnsStorageKey = (context: "dealer" | "admin") => `mmb-report-columns-${context}`;

export function ReportsBuilder({
  context,
  dealers = [],
  products = [],
}: {
  context: "dealer" | "admin";
  dealers?: ReportDealerOption[];
  products?: string[];
}) {
  const { can } = usePermissions();
  const canExport = context === "dealer" || can("reports.export");
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: addDays(new Date(), -29),
    to: new Date(),
  }));
  const [status, setStatus] = React.useState<string>("");
  const [type, setType] = React.useState<string>("");
  const [product, setProduct] = React.useState<string>("");
  const [dealerIds, setDealerIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [columns, setColumns] = React.useState<ReportColumnState[]>(() => defaultColumnState(context));
  const columnsLoaded = React.useRef(false);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(columnsStorageKey(context));
      if (saved) setColumns(normalizeColumnState(context, JSON.parse(saved)));
    } catch {
      // Повреждённая настройка — остаёмся на колонках по умолчанию.
    }
    columnsLoaded.current = true;
  }, [context]);
  React.useEffect(() => {
    if (!columnsLoaded.current) return;
    try {
      localStorage.setItem(columnsStorageKey(context), JSON.stringify(columns));
    } catch {
      // Приватный режим браузера — настройка просто не запомнится.
    }
  }, [columns, context]);
  const visibleKeys = React.useMemo(() => columns.filter((c) => c.visible).map((c) => c.key), [columns]);

  // Экранный просмотр отчёта — показываем данные сразу, без ожидания экспорта.
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [limit, setLimit] = React.useState(100);
  const [totals, setTotals] = React.useState<Totals>({ price: 0 });
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
      product: product || null,
      dealerIds: context === "admin" ? dealerIds : undefined,
      scope: context,
    }),
    [range.from, range.to, status, type, product, dealerIds, context],
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
            setTotals({ price: 0 });
          }
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setRows(j.rows ?? []);
          setCount(j.count ?? 0);
          setLimit(j.limit ?? 100);
          setTotals(j.totals ?? { price: 0 });
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
    if (visibleKeys.length === 0) {
      toast.error("Включите хотя бы одну колонку");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/reports/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, columns: visibleKeys, preview: false }),
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

  const productOptions = React.useMemo(
    () => [{ value: "", label: "Все продукты" }, ...products.map((p) => ({ value: p, label: p }))],
    [products],
  );

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="font-display text-lg tracking-tight mb-4">Параметры отчёта</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Select
              label="Статус"
              value={status}
              onChange={(v) => setStatus(v)}
              placeholder="Все"
              options={LICENSE_STATUS_FILTER_OPTIONS}
            />
            <Select
              label="Тип лицензии"
              value={type}
              onChange={(v) => setType(v)}
              placeholder="Все типы лицензий"
              options={LICENSE_KIND_FILTER_OPTIONS}
            />
            <Select
              label="Продукт"
              value={product}
              onChange={(v) => setProduct(v)}
              placeholder="Все продукты"
              options={productOptions}
              searchable={products.length > 8}
              searchPlaceholder="Поиск продукта"
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
            <Line label="Статус">
              {LICENSE_STATUS_FILTER_OPTIONS.find((o) => o.value === status)?.label ?? "Все"}
            </Line>
            <Line label="Тип лицензии">{type ? kindLabel(type) : "Все типы"}</Line>
            <Line label="Продукт">{product || "Все"}</Line>
            {context === "admin" ? (
              <Line label="Представители">
                {dealerIds.length === 0 ? "Все" : `Выбрано: ${dealerIds.length}`}
              </Line>
            ) : null}
            <div className="divider my-3" />
            <Line label="Найдено лицензий">
              <span className="font-display text-lg">{previewLoading ? "…" : count}</span>
            </Line>
            <Line label="Сумма по цене">
              <span className="font-display">{previewLoading ? "…" : formatRub(totals.price)}</span>
            </Line>
            {context === "admin" && totals.basePrice !== undefined ? (
              <Line label="Сумма базовых цен">
                <span className="font-display">{previewLoading ? "…" : formatRub(totals.basePrice)}</span>
              </Line>
            ) : null}
          </div>
          <div className="divider my-4" />
          <div className="text-xs text-ink-muted">
            В XLSX попадают колонки из настройки предпросмотра в том же порядке. Файл доступен по
            подписанной ссылке 5 минут.
          </div>
        </Card>
      </div>

      <ReportPreview
        rows={rows}
        count={count}
        limit={limit}
        loading={previewLoading}
        context={context}
        columns={columns}
        visibleKeys={visibleKeys}
        onColumnsChange={setColumns}
      />
    </div>
  );
}

function ReportPreview({
  rows,
  count,
  limit,
  loading,
  context,
  columns,
  visibleKeys,
  onColumnsChange,
}: {
  rows: ReportRow[];
  count: number;
  limit: number;
  loading: boolean;
  context: "dealer" | "admin";
  columns: ReportColumnState[];
  visibleKeys: ReportColumnKey[];
  onColumnsChange: (next: ReportColumnState[]) => void;
}) {
  const detailKeys = visibleKeys.filter((k) => k !== "number" && k !== "status");
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-hairline">
        <div className="font-display tracking-tight">Предпросмотр</div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-ink-muted">
            {loading
              ? "Загрузка…"
              : count > limit
                ? `Показаны первые ${limit} из ${count}`
                : `Строк: ${count}`}
          </div>
          <ColumnsMenu context={context} columns={columns} onChange={onColumnsChange} />
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
              <LicenseLink row={r} context={context} />
              <StatusTag kind="license" status={r.status} />
            </div>
            <dl className="mt-1.5 space-y-0.5 text-xs">
              {detailKeys.map((key) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-ink-subtle shrink-0">{reportColumn(key).label}:</dt>
                  <dd className="text-ink-muted min-w-0 break-words">{renderCell(r, key, context)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* Десктоп-таблица */}
      <div className="hidden md:block overflow-x-auto scrollbar-clean">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
              {visibleKeys.map((key) => (
                <th key={key} className="px-4 py-3 whitespace-nowrap">
                  {reportColumn(key).label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleKeys.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-center text-ink-muted">
                  Все колонки скрыты — включите нужные в меню «Колонки»
                </td>
              </tr>
            ) : null}
            {rows.length === 0 && !loading && visibleKeys.length > 0 ? (
              <tr>
                <td colSpan={visibleKeys.length} className="px-5 py-12 text-center text-ink-muted">
                  Ничего не найдено
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-surface-muted">
                {visibleKeys.map((key) => (
                  <td
                    key={key}
                    className={cn(
                      "px-4 py-3 align-top",
                      key === "number" || key === "createdAt" || isMoney(key) ? "whitespace-nowrap" : "",
                      key === "number" || key === "status" || key === "payment" ? "" : "text-ink-muted",
                    )}
                  >
                    {renderCell(r, key, context)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function isMoney(key: ReportColumnKey) {
  return key === "price" || key === "basePrice" || key === "margin";
}

function LicenseLink({ row, context }: { row: ReportRow; context: "dealer" | "admin" }) {
  return (
    <Link
      href={`/${context}/licenses/${row.id}`}
      target="_blank"
      className="font-mono text-[13px] text-accent hover:underline"
      title="Открыть лицензию в новой вкладке"
    >
      {row.number}
    </Link>
  );
}

function renderCell(r: ReportRow, key: ReportColumnKey, context: "dealer" | "admin"): React.ReactNode {
  switch (key) {
    case "number":
      return <LicenseLink row={r} context={context} />;
    case "status":
      return <StatusTag kind="license" status={r.status} />;
    case "payment":
      return r.paymentStatus ? <StatusTag kind="payment" status={r.paymentStatus} /> : r.payment;
    case "price":
    case "basePrice":
    case "margin": {
      const v = r[key];
      return v === null || v === undefined ? "—" : formatRub(v);
    }
    case "issuedWithoutPayment":
      return r.issuedWithoutPayment ? "Да" : "—";
    case "dealerComment":
      return r.dealerComment ? (
        <span className="block max-w-[280px] whitespace-pre-line break-words">{r.dealerComment}</span>
      ) : (
        "—"
      );
    default:
      return r[key] || "—";
  }
}

function ColumnsMenu({
  context,
  columns,
  onChange,
}: {
  context: "dealer" | "admin";
  columns: ReportColumnState[];
  onChange: (next: ReportColumnState[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function move(from: number, to: number) {
    if (to < 0 || to >= columns.length || from === to) return;
    const next = [...columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function toggle(index: number) {
    onChange(columns.map((c, i) => (i === index ? { ...c, visible: !c.visible } : c)));
  }

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Колонки · {visibleCount}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-panel border border-hairline bg-white shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
            <span className="text-xs text-ink-muted">Перетащите, чтобы изменить порядок</span>
            <button
              type="button"
              onClick={() => onChange(defaultColumnState(context))}
              className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
              title="Вернуть колонки по умолчанию"
            >
              <RotateCcw className="h-3 w-3" /> Сброс
            </button>
          </div>
          <ul className="max-h-[360px] overflow-y-auto scrollbar-clean py-1">
            {columns.map((c, index) => (
              <li
                key={c.key}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) {
                    move(dragIndex, index);
                    setDragIndex(index);
                  }
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm transition-colors",
                  dragIndex === index ? "bg-accent/10" : "hover:bg-surface-muted",
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-subtle" />
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] transition-colors",
                      c.visible ? "bg-accent text-white" : "border border-hairline bg-white",
                    )}
                  >
                    {c.visible ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className={cn("truncate", !c.visible && "text-ink-muted")}>
                    {reportColumn(c.key).label}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-ink-subtle hover:text-accent disabled:opacity-30"
                  aria-label="Выше"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === columns.length - 1}
                  className="rounded p-0.5 text-ink-subtle hover:text-accent disabled:opacity-30"
                  aria-label="Ниже"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
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
