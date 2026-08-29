import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  query,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  function href(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v) params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const showNav = totalPages > 1;
  const navBtn =
    "inline-flex items-center gap-1.5 rounded-btn h-9 px-3.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="text-xs text-ink-muted">
        {total === 0 ? "Нет записей" : `Показано ${from}–${to} из ${total}`}
      </div>
      {showNav ? (
        <div className="flex items-center gap-2">
          {current > 1 ? (
            <Link href={href(current - 1)} className={cn(navBtn, "bg-white border border-hairline text-ink hover:border-accent hover:text-accent")}>
              <ChevronLeft className="h-4 w-4" /> Назад
            </Link>
          ) : (
            <span className={cn(navBtn, "border border-hairline text-ink-subtle cursor-not-allowed")} aria-disabled="true">
              <ChevronLeft className="h-4 w-4" /> Назад
            </span>
          )}
          <span className="text-xs text-ink-muted tabular-nums px-1">
            {current} / {totalPages}
          </span>
          {current < totalPages ? (
            <Link href={href(current + 1)} className={cn(navBtn, "bg-white border border-hairline text-ink hover:border-accent hover:text-accent")}>
              Далее <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(navBtn, "border border-hairline text-ink-subtle cursor-not-allowed")} aria-disabled="true">
              Далее <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
