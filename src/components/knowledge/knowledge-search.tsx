"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Строка поиска по базе знаний. Запрос уходит в адрес (`?q=`) с небольшой
 * задержкой, список статей пересчитывает сервер.
 */
export function KnowledgeSearch({
  basePath,
  initialQuery,
  className,
}: {
  basePath: string;
  initialQuery: string;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initialQuery);
  const [pending, startTransition] = React.useTransition();
  const pushed = React.useRef(initialQuery);

  // Переход по категории сбрасывает запрос в адресе — сбрасываем и поле.
  React.useEffect(() => {
    if (initialQuery !== pushed.current) {
      pushed.current = initialQuery;
      setValue(initialQuery);
    }
  }, [initialQuery]);

  React.useEffect(() => {
    const q = value.trim();
    if (q === pushed.current.trim()) return;
    const timer = window.setTimeout(() => {
      pushed.current = q;
      startTransition(() => {
        router.replace(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath, { scroll: false });
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, basePath, router]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Поиск по статьям"
        aria-label="Поиск по базе знаний"
        className="field-control h-11 w-full rounded-panel border border-hairline bg-white pl-10 pr-10 text-sm placeholder:text-ink-subtle focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {pending ? (
        <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-subtle" />
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-btn text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
