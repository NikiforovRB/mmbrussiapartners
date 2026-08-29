"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Лёгкое притягивание элемента к курсору. Пружины здесь не нужны: короткого
 * CSS-перехода хватает, а элемент встречается на публичных страницах, где
 * важен вес первого чанка.
 */
export function Magnetic({
  children,
  strength = 18,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left - r.width / 2;
    const py = e.clientY - r.top - r.height / 2;
    setOffset({
      x: (px / (r.width / 2)) * strength,
      y: (py / (r.height / 2)) * strength,
    });
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setOffset({ x: 0, y: 0 })}
      className={cn("motion-safe:transition-transform motion-safe:duration-200 ease-out", className)}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
    >
      {children}
    </div>
  );
}
