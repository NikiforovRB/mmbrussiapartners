"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SettingsForm } from "./settings-form";
import { HomepageEditorForm } from "./homepage-editor-form";
import type { HomepageContent } from "@/lib/homepage-content";

type Tab = "general" | "homepage";

export function SettingsTabs({
  general,
  homepage,
}: {
  general: { phone: string; email: string; address: string };
  homepage: HomepageContent;
}) {
  const [tab, setTab] = React.useState<Tab>("general");

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={cn(
            "rounded-btn px-4 h-10 text-sm transition-colors",
            tab === "general" ? "bg-accent text-white" : "border border-hairline text-ink-muted hover:border-accent hover:text-accent",
          )}
        >
          Основные данные
        </button>
        <button
          type="button"
          onClick={() => setTab("homepage")}
          className={cn(
            "rounded-btn px-4 h-10 text-sm transition-colors",
            tab === "homepage" ? "bg-accent text-white" : "border border-hairline text-ink-muted hover:border-accent hover:text-accent",
          )}
        >
          Редактор главной страницы
        </button>
      </div>
      {tab === "general" ? <SettingsForm initial={general} /> : <HomepageEditorForm initial={homepage} />}
    </div>
  );
}
