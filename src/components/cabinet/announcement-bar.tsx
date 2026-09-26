"use client";

import * as React from "react";
import { Megaphone, X } from "lucide-react";

/**
 * Оранжевая полоса-объявление на всю ширину окна над кабинетом: новости,
 * важные обновления или предупреждение о технических работах. Закрывается
 * пользователем; ключ закрытия привязан к updatedAt, поэтому новое объявление
 * показывается снова.
 *
 * Пока полоса видна, в `--announcement-offset` лежит её видимая высота:
 * по ней липкое левое меню укорачивается и не уходит за нижний край окна.
 */
export function AnnouncementBar({
  text,
  updatedAt,
}: {
  text: string;
  updatedAt: string | null;
}) {
  const storageKey = React.useMemo(
    () => `mmb-announcement-dismissed:${updatedAt ?? text.slice(0, 40)}`,
    [updatedAt, text],
  );
  const [dismissed, setDismissed] = React.useState(true);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  const visible = !dismissed && Boolean(text.trim());

  React.useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bottom = ref.current?.getBoundingClientRect().bottom ?? 0;
      root.style.setProperty("--announcement-offset", `${Math.max(0, Math.round(bottom))}px`);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--announcement-offset");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div ref={ref} className="bg-[#fc4c02] text-white">
      <div className="px-4 lg:px-6 py-2.5 flex items-center gap-3">
        <Megaphone className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-[13px] leading-snug">{text}</p>
        <button
          type="button"
          aria-label="Закрыть объявление"
          onClick={() => {
            window.localStorage.setItem(storageKey, "1");
            setDismissed(true);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
