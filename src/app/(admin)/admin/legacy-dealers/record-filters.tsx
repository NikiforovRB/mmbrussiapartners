"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

export function RecordFilters({
  initialQuery,
  initialOwner,
  initialPay,
  showPay,
}: {
  initialQuery: string;
  initialOwner: string;
  initialPay: string;
  showPay: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initialQuery);
  const [owner, setOwner] = React.useState(initialOwner);
  const [pay, setPay] = React.useState(initialPay);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      for (const [key, value] of [
        ["q", q],
        ["owner", owner],
        ["pay", pay],
      ] as const) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (url.search === window.location.search) return;
      url.searchParams.delete("page");
      router.replace(`${pathname}${url.search}`);
    }, 250);
    return () => clearTimeout(t);
  }, [q, owner, pay, router, pathname]);

  return (
    <div className={showPay ? "grid gap-3 md:grid-cols-[1fr_230px_200px]" : "grid gap-3 md:grid-cols-[1fr_230px]"}>
      <div className="flex h-12 items-center gap-2 rounded-panel border border-hairline px-4 transition-colors focus-within:border-accent">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Комментарий, продукт, версия, дилер, email…"
          className="w-full bg-transparent text-sm placeholder:text-ink-subtle"
        />
      </div>
      <Select
        value={owner}
        onChange={setOwner}
        placeholder="Дилер портала: все"
        options={[
          { value: "", label: "Дилер портала: все" },
          { value: "assigned", label: "Есть дилер портала" },
          { value: "unassigned", label: "Не распределены" },
          { value: "manual", label: "Назначены вручную" },
        ]}
      />
      {showPay ? (
        <Select
          value={pay}
          onChange={setPay}
          placeholder="Оплата: все"
          options={[
            { value: "", label: "Оплата: все" },
            { value: "paid", label: "Оплачено" },
            { value: "unpaid", label: "Не оплачено" },
          ]}
        />
      ) : null}
    </div>
  );
}
