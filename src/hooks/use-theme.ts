"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { applyTheme, readTheme, storeTheme, subscribeTheme, type Theme } from "@/lib/theme";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export function useTheme() {
  const theme = React.useSyncExternalStore<Theme>(subscribeTheme, readTheme, () => "light");

  const setTheme = React.useCallback((next: Theme, origin?: { x: number; y: number }) => {
    const update = () => {
      storeTheme(next);
      applyTheme(next, window.location.pathname);
    };
    const doc = document as ViewTransitionDocument;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || reduceMotion) {
      const root = document.documentElement;
      root.classList.add("theme-switching");
      update();
      window.setTimeout(() => root.classList.remove("theme-switching"), 400);
      return;
    }

    const transition = doc.startViewTransition(update);
    if (!origin) return;
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }, []);

  return { theme, setTheme };
}

/**
 * Держит класс темы на <html> в соответствии с выбором и текущим разделом.
 * Тему берёт прямо из localStorage: при гидрации useTheme ещё отдаёт серверное
 * "light", и класс, выставленный скриптом в <head>, слетел бы до перерисовки.
 */
export function ThemeSync() {
  const pathname = usePathname();
  useIsomorphicLayoutEffect(() => {
    applyTheme(readTheme(), pathname);
  }, [pathname]);
  React.useEffect(() => subscribeTheme(() => applyTheme(readTheme(), window.location.pathname)), []);
  return null;
}
