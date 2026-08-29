"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

export function DealersFilters({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      if (status) url.searchParams.set("status", status);
      else url.searchParams.delete("status");
      url.searchParams.delete("page");
      router.replace(`${pathname}${url.search}`);
    }, 250);
    return () => clearTimeout(t);
  }, [q, status, router, pathname]);

  return (
    <div className="grid md:grid-cols-[1fr_240px] gap-3">
      <div className="flex items-center gap-2 rounded-panel border border-hairline px-4 h-12 transition-colors focus-within:border-accent">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ФИО, email, организация, телефон..."
          className="bg-transparent w-full text-sm placeholder:text-ink-subtle"
        />
      </div>
      <Select
        value={status}
        onChange={(v) => setStatus(v)}
        placeholder="Все статусы"
        options={[
          { value: "", label: "Все статусы" },
          { value: "PENDING", label: "Ожидают одобрения" },
          { value: "APPROVED", label: "Одобрены" },
          { value: "REJECTED", label: "Отклонены" },
          { value: "SUSPENDED", label: "Заблокированы" },
        ]}
      />
    </div>
  );
}
