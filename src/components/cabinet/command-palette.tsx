"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  KeyRound,
  Users,
  Shield,
  FileSpreadsheet,
  MapPinned,
  Settings,
  CreditCard,
  Plus,
  History,
  LayoutDashboard,
  ClipboardList,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ReactNode;
  keywords?: string[];
  scope: "dealer" | "admin" | "both";
};

const ITEMS: Item[] = [
  {
    id: "d-dash",
    label: "Дашборд (дилер)",
    href: "/dealer",
    icon: <LayoutDashboard className="h-4 w-4" />,
    scope: "dealer",
  },
  {
    id: "d-licenses",
    label: "Мои лицензии",
    href: "/dealer/licenses",
    icon: <KeyRound className="h-4 w-4" />,
    scope: "dealer",
  },
  {
    id: "d-new",
    label: "Новая лицензия",
    href: "/dealer/licenses/new",
    icon: <Plus className="h-4 w-4" />,
    scope: "dealer",
    keywords: ["create", "device"],
  },
  {
    id: "d-payments",
    label: "Платежи",
    href: "/dealer/payments",
    icon: <CreditCard className="h-4 w-4" />,
    scope: "dealer",
  },
  {
    id: "d-reports",
    label: "Отчёты",
    href: "/dealer/reports",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    scope: "dealer",
  },

  {
    id: "a-dash",
    label: "Дашборд (админ)",
    href: "/admin",
    icon: <LayoutDashboard className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-dealers",
    label: "Представители",
    href: "/admin/dealers",
    icon: <Users className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-licenses",
    label: "Все лицензии",
    href: "/admin/licenses",
    icon: <KeyRound className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-license-new",
    label: "Новая лицензия",
    href: "/admin/licenses/new",
    icon: <Plus className="h-4 w-4" />,
    scope: "admin",
    keywords: ["создать", "генерация"],
  },
  {
    id: "a-cancel-req",
    label: "Заявки на аннулирование",
    href: "/admin/cancellation-requests",
    icon: <ClipboardList className="h-4 w-4" />,
    scope: "admin",
    keywords: ["аннулирование", "заявки"],
  },
  {
    id: "a-roles",
    label: "Роли",
    href: "/admin/roles",
    icon: <Shield className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-reports",
    label: "Отчёты",
    href: "/admin/reports",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-geo",
    label: "Гео-аналитика",
    href: "/admin/geo",
    icon: <MapPinned className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-payments",
    label: "Платежи",
    href: "/admin/payments",
    icon: <CreditCard className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-audit",
    label: "Аудит",
    href: "/admin/audit",
    icon: <History className="h-4 w-4" />,
    scope: "admin",
  },
  {
    id: "a-settings",
    label: "Настройки",
    href: "/admin/settings",
    icon: <Settings className="h-4 w-4" />,
    scope: "admin",
  },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const items = React.useMemo(() => {
    const lower = q.trim().toLowerCase();
    if (!lower) return ITEMS;
    return ITEMS.filter((i) => {
      const hay = [i.label, ...(i.keywords ?? [])].join(" ").toLowerCase();
      return hay.includes(lower);
    });
  }, [q]);

  React.useEffect(() => {
    setActive(0);
  }, [q, open]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[18vh] px-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-[#06121f]/55"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl rounded-panel bg-white border border-hairline p-3 animate-modal-in">
        <div className="flex items-center gap-2 rounded-panel border border-hairline px-4 h-12 transition-colors focus-within:border-accent">
          <Search className="h-4 w-4 text-ink-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Куда перейти?"
            className="bg-transparent w-full text-sm placeholder:text-ink-subtle"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (items[active]) go(items[active].href);
              }
            }}
          />
          <span className="text-[10px] uppercase tracking-tight text-ink-subtle">
            Esc
          </span>
        </div>
        <ul className="mt-2 max-h-[50vh] overflow-auto scrollbar-clean">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                onClick={() => go(it.href)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-3 rounded-panel px-3 py-2.5 text-sm text-left transition-colors ${
                  active === i ? "bg-surface-muted" : "hover:bg-surface-muted"
                }`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-panel text-accent">
                  {it.icon}
                </span>
                <span className="flex-1">{it.label}</span>
                <span className="text-[11px] uppercase tracking-tight text-ink-subtle">
                  {it.scope === "dealer"
                    ? "Партнёр"
                    : it.scope === "admin"
                      ? "Админ"
                      : "Везде"}
                </span>
              </button>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="px-3 py-6 text-sm text-ink-muted text-center">
              Ничего не найдено
            </li>
          ) : null}
        </ul>
        <div className="mt-2 flex items-center justify-between px-3 py-2 text-[11px] text-ink-subtle">
          <span>↑↓ навигация</span>
          <span>↵ перейти</span>
          <span>Cmd/Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
