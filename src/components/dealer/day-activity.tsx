"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { DatePicker } from "@/components/ui/date-picker";
import { formatRuTime } from "@/lib/dates";

type ActivityItem = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
  licenseId: string | null;
  licenseNumber: string | null;
};

function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DayActivity() {
  const [date, setDate] = React.useState<Date | null>(new Date());
  const [items, setItems] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback((d: Date) => {
    setLoading(true);
    fetch(`/api/dealer/activity?date=${toDateParam(d)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: ActivityItem[] }) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (date) load(date);
  }, [date, load]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent" />
          <div className="font-display text-lg tracking-tight">Активность за день</div>
        </div>
        <div className="w-full sm:w-56">
          <DatePicker value={date} onChange={setDate} />
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-ink-muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-ink-muted">
          В этот день действий не было
        </div>
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {items.map((it) => (
            <li key={it.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag tone={actionTone(it.action)}>{actionLabel(it.action)}</Tag>
                  {it.licenseNumber ? (
                    <Link
                      href={`/dealer/licenses/${it.licenseId}`}
                      className="text-sm hover:text-accent"
                    >
                      {it.licenseNumber}
                    </Link>
                  ) : null}
                </div>
                <span className="text-xs text-ink-muted">{formatRuTime(it.createdAt)}</span>
              </div>
              {it.reason ? <div className="text-xs text-ink-muted mt-1.5">{it.reason}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function actionLabel(a: string): string {
  switch (a) {
    case "CREATED":
      return "Создана";
    case "EDITED":
      return "Изменена";
    case "CANCELLED":
      return "Аннулирована";
    case "REVOKED":
      return "Отозвана";
    case "DELETED":
      return "Удалена";
    case "RESTORED":
      return "Восстановлена";
    case "EXPIRED":
      return "Истекла";
    default:
      return a;
  }
}

function actionTone(a: string): "neutral" | "accent" | "warning" | "danger" | "success" | "muted" {
  switch (a) {
    case "CREATED":
      return "success";
    case "EDITED":
      return "accent";
    case "CANCELLED":
      return "warning";
    case "REVOKED":
    case "DELETED":
      return "danger";
    case "RESTORED":
      return "success";
    default:
      return "neutral";
  }
}
