"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
  hint?: string;
  error?: string;
  tone?: "light" | "dark";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, label, hint, error, id, tone = "light", ...props },
  ref,
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-[12.5px]  text-ink-muted">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "field-control group relative flex items-center gap-2 rounded-panel px-4 h-12 border transition-colors",
          "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
          tone === "light" ? "bg-white border-hairline" : "bg-white/10 border-white/20 text-white",
          error && "border-danger",
          props.disabled && "bg-surface-muted text-ink-muted cursor-not-allowed",
        )}
      >
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full bg-transparent placeholder:text-ink-subtle text-[14.5px]",
            tone === "dark" && "placeholder:text-white/50 text-white",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
});
