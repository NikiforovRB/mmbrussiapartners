"use client";

import * as React from "react";
import { Calendar, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { addDays, addMonths, formatRuDate } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";

const PRESETS = [
  { id: "today", label: "Сегодня", days: 0 },
  { id: "7d", label: "7 дней", days: 7 },
  { id: "30d", label: "30 дней", days: 30 },
  { id: "90d", label: "Квартал", days: 90 },
  { id: "365d", label: "Год", days: 365 },
] as const;

export function ReportsBuilder({ context }: { context: "dealer" | "admin" }) {
  const { can } = usePermissions();
  const canExport = context === "dealer" || can("reports.export");
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: addDays(new Date(), -29),
    to: new Date(),
  }));
  const [status, setStatus] = React.useState<string>("");
  const [type, setType] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  function applyPreset(days: number) {
    const to = new Date();
    const from = days === 0 ? new Date(to.getFullYear(), to.getMonth(), to.getDate()) : addDays(to, -days);
    setRange({ from, to });
  }

  async function exportXlsx() {
    if (!range.from || !range.to) {
      toast.error("Выберите период");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/reports/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        status: status || null,
        type: type || null,
        scope: context,
      }),
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
    <div className="grid lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <div className="font-display text-lg  tracking-tight mb-4">Параметры отчёта</div>
        <div className="grid sm:grid-cols-3 gap-3">
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
            label="Тип"
            value={type}
            onChange={(v) => setType(v)}
            placeholder="Любой"
            options={[
              { value: "", label: "Любой" },
              { value: "ECO", label: "ECO" },
              { value: "FULL", label: "FULL" },
              { value: "CUSTOM", label: "CUSTOM" },
            ]}
          />
        </div>
        <div className="mt-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.days)}
              className="rounded-btn bg-white px-3.5 py-1.5 text-xs hover:bg-card-light"
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
          <div className="font-display  tracking-tight">Итог</div>
        </div>
        <div className="space-y-2 text-sm">
          <Line icon={<Calendar className="h-3.5 w-3.5" />} label="Период">
            {range.from && range.to
              ? `${formatRuDate(range.from)} — ${formatRuDate(range.to)}`
              : "—"}
          </Line>
          <Line label="Статус">{status || "Все"}</Line>
          <Line label="Тип">{type || "Любой"}</Line>
        </div>
        <div className="divider my-4" />
        <div className="text-xs text-ink-muted">
          Файл сохраняется в защищённое хранилище и доступен по подписанной ссылке в течение 5 минут.
        </div>
      </Card>
    </div>
  );
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
