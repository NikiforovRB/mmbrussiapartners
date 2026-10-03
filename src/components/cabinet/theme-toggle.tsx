"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/**
 * Переключатель «Светлая / Тёмная» внизу меню. Положение бегунка и иконок
 * задано вариантами dark:, а не состоянием React: при смене темы через
 * View Transitions снимок новой темы уже показывает переключатель в новом
 * положении.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fromPointer = e.clientX !== 0 || e.clientY !== 0;
    setTheme(isDark ? "light" : "dark", {
      x: fromPointer ? e.clientX : rect.left + rect.width / 2,
      y: fromPointer ? e.clientY : rect.top + rect.height / 2,
    });
  }

  if (compact) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Тёмная тема"
        title={isDark ? "Светлая тема" : "Тёмная тема"}
        onClick={toggle}
        className={cn(
          "relative mx-auto grid h-10 w-10 place-items-center overflow-hidden rounded-btn text-ink-muted transition-colors hover:bg-surface/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          className,
        )}
      >
        <Sun className="absolute h-5 w-5 text-warning transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:rotate-90 dark:scale-0 dark:opacity-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 text-strong-accent opacity-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:rotate-0 dark:scale-100 dark:opacity-100" />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Тёмная тема"
      onClick={toggle}
      className={cn(
        "group relative grid h-11 w-full grid-cols-2 items-center rounded-panel border border-hairline bg-surface/40 p-1 text-[13px] text-ink-muted transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[9px] bg-surface shadow-[0_8px_18px_-10px_rgba(11,16,32,0.45)] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] dark:translate-x-full dark:bg-bg-dark"
      />
      <span className="relative z-10 flex items-center justify-center gap-1.5 text-ink transition-colors duration-300 dark:text-ink-subtle dark:group-hover:text-ink-muted">
        <Sun className="h-4 w-4 text-warning transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:-rotate-90 dark:scale-75 dark:text-current" />
        Светлая
      </span>
      <span className="relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-300 group-hover:text-ink dark:text-ink">
        <Moon className="h-4 w-4 -rotate-45 scale-75 transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] dark:rotate-0 dark:scale-100 dark:text-strong-accent" />
        Тёмная
      </span>
    </button>
  );
}
