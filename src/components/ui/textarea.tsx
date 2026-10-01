"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Показать счётчик «N / maxLength» под полем. */
  counter?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, counter, id, rows = 4, ...props },
  ref,
) {
  const generatedId = React.useId();
  const textareaId = id ?? generatedId;
  const max = typeof props.maxLength === "number" ? props.maxLength : null;
  const length = String(props.value ?? "").length;
  const showCounter = Boolean(counter && max);
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={textareaId} className="block text-[12.5px]  text-ink-muted">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "field-control rounded-panel bg-white border border-hairline px-4 py-3 transition-colors",
          "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
          error && "border-danger",
        )}
      >
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            "w-full resize-none bg-transparent text-[14.5px] placeholder:text-ink-subtle",
            className,
          )}
          {...props}
        />
      </div>
      {error || hint || showCounter ? (
        <div className="flex items-start justify-between gap-3">
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : hint ? (
            <p className="text-xs text-ink-subtle">{hint}</p>
          ) : (
            <span />
          )}
          {showCounter ? (
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                max !== null && length >= max ? "text-danger" : "text-ink-subtle",
              )}
              aria-live="polite"
            >
              {length} / {max}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
