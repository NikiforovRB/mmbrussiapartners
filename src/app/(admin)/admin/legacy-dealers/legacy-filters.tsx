"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";

export function LegacyFilters({
  initialQuery,
  initialSource,
  initialLink,
}: {
  initialQuery: string;
  initialSource: string;
  initialLink: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(initialQuery);
  const [source, setSource] = React.useState(initialSource);
  const [link, setLink] = React.useState(initialLink);

  React.useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      for (const [key, value] of [
        ["q", q],
        ["source", source],
        ["link", link],
      ] as const) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (url.search === window.location.search) return;
      url.searchParams.delete("page");
      router.replace(`${pathname}${url.search}`);
    }, 250);
    return () => clearTimeout(t);
  }, [q, source, link, router, pathname]);

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
      <div className="flex h-12 items-center gap-2 rounded-panel border border-hairline px-4 transition-colors focus-within:border-accent">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя, город, email, телефон…"
          className="w-full bg-transparent text-sm placeholder:text-ink-subtle"
        />
      </div>
      <Select
        value={source}
        onChange={setSource}
        placeholder="Все источники"
        options={[
          { value: "", label: "Все источники" },
          { value: "account", label: "Учётки субдилеров" },
          { value: "comment", label: "Клиенты общего кабинета" },
        ]}
      />
      <Select
        value={link}
        onChange={setLink}
        placeholder="Портал: все"
        options={[
          { value: "", label: "Портал: все" },
          { value: "linked", label: "Есть на портале" },
          { value: "unlinked", label: "Не привязаны" },
        ]}
      />
    </div>
  );
}
