"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SettingsForm } from "./settings-form";
import { HomepageEditorForm } from "./homepage-editor-form";
import { AnnouncementForm } from "./announcement-form";
import { SupportForm } from "./support-form";
import { GenerationForm } from "./generation-form";
import type { HomepageContent } from "@/lib/homepage-content";
import type { Announcement, SupportSettings, GenerationSettings } from "@/lib/site-settings";

type Tab = "general" | "homepage" | "announcement" | "support" | "generation" | "payment";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "Основные данные" },
  { key: "homepage", label: "Редактор главной страницы" },
  { key: "announcement", label: "Объявление" },
  { key: "support", label: "Техподдержка" },
  { key: "generation", label: "Ограничения генерации" },
  { key: "payment", label: "Настройки онлайн-оплаты" },
];

export function SettingsTabs({
  general,
  homepage,
  announcement,
  support,
  generation,
  payment,
}: {
  general: { phone: string; email: string; address: string };
  homepage: HomepageContent;
  announcement: Announcement;
  support: SupportSettings;
  generation: GenerationSettings;
  payment: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<Tab>("general");

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-btn px-4 h-10 text-sm transition-colors",
              tab === t.key
                ? "bg-accent text-white"
                : "border border-hairline text-ink-muted hover:border-accent hover:text-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" ? <SettingsForm initial={general} /> : null}
      {tab === "homepage" ? <HomepageEditorForm initial={homepage} /> : null}
      {tab === "announcement" ? <AnnouncementForm initial={announcement} /> : null}
      {tab === "support" ? <SupportForm initial={support} /> : null}
      {tab === "generation" ? <GenerationForm initial={generation} /> : null}
      {tab === "payment" ? payment : null}
    </div>
  );
}
