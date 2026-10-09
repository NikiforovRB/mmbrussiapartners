"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { usePermissions } from "@/hooks/use-permissions";
import type { CabinetSections } from "@/lib/site-settings";

/** Показывает или скрывает раздел в кабинетах дилеров — сохраняется сразу. */
export function SectionVisibilityToggle({
  section,
  initial,
  label,
  description,
}: {
  section: keyof CabinetSections;
  initial: boolean;
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  async function change(next: boolean) {
    setOn(next);
    setBusy(true);
    const res = await fetch("/api/settings/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [section]: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success(next ? "Раздел показан дилерам" : "Раздел скрыт у дилеров");
    router.refresh();
  }

  return (
    <Toggle
      checked={on}
      onChange={change}
      disabled={busy || !can("settings.edit")}
      label={label}
      description={description}
    />
  );
}
