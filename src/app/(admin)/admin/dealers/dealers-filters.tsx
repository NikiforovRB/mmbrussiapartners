"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

export function DealersFilters({
  initialQuery,
  initialStatus,
  initialPublication,
}: {
  initialQuery: string;
  initialStatus: string;
  initialPublication: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);
  const [pub, setPub] = React.useState(initialPublication);

  // Ссылка «N заявок на публикацию» меняет адрес снаружи — подхватываем фильтр.
  React.useEffect(() => setPub(initialPublication), [initialPublication]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      if (status) url.searchParams.set("status", status);
      else url.searchParams.delete("status");
      if (pub) url.searchParams.set("pub", pub);
      else url.searchParams.delete("pub");
      if (url.search === window.location.search) return;
      url.searchParams.delete("page");
      router.replace(`${pathname}${url.search}`);
    }, 250);
    return () => clearTimeout(t);
  }, [q, status, pub, router, pathname]);

  return (
    <div className="grid md:grid-cols-[1fr_220px_220px] gap-3">
      <div className="flex items-center gap-2 rounded-panel border border-hairline px-4 h-12 transition-colors focus-within:border-accent">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ФИО, email, телефон, организация, город, регион, страна…"
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
      <Select
        value={pub}
        onChange={(v) => setPub(v)}
        placeholder="Публикация: все"
        options={[
          { value: "", label: "Публикация: все" },
          { value: "PENDING", label: "Заявки на публикацию" },
          { value: "PUBLISHED", label: "На сайте" },
          { value: "REJECTED", label: "Отклонённые" },
        ]}
      />
    </div>
  );
}
