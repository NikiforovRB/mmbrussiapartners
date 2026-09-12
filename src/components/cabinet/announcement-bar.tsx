"use client";

import * as React from "react";
import { Megaphone, X } from "lucide-react";

/**
 * Оранжевая полоса-объявление под шапкой кабинета: новости, важные обновления
 * или предупреждение о технических работах. Закрывается пользователем; ключ
 * закрытия привязан к updatedAt, поэтому новое объявление показывается снова.
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

  React.useEffect(() => {
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  if (dismissed || !text.trim()) return null;

  return (
    <div className="-mx-4 lg:-mx-6 border-b border-[#f5b544] bg-[#fff4e0] text-[#8a5200]">
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
          className="grid h-7 w-7 shrink-0 place-items-center rounded-btn text-[#8a5200] transition-colors hover:bg-[#f5b544]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b544]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
