"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  // Окно живёт в body: любой предок с transform, filter или backdrop-filter
  // становится точкой отсчёта для position: fixed — и окно съезжает внутрь
  // него. Такой предок оставляет после себя даже animate-fade-up.
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const sizeMap = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
  } as const;

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-[#06121f]/55"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-clean",
          "bg-white border border-hairline rounded-panel p-6 animate-modal-in",
          sizeMap[size],
          className,
        )}
        style={{ boxShadow: "0 32px 80px -24px rgba(11,16,32,0.35)" }}
      >
        {title || description ? (
          <div className="mb-5 pr-10">
            {title ? (
              <h2 className="font-display text-xl  tracking-tight">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
        <div>{children}</div>
        {footer ? (
          <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
