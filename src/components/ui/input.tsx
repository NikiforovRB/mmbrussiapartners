"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
  hint?: string;
  error?: string;
  tone?: "light" | "dark";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, label, hint, error, id, tone = "light", type, ...props },
  ref,
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const isPassword = type === "password";
  const [revealed, setRevealed] = React.useState(false);
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
          isPassword && "pr-2",
        )}
      >
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && revealed ? "text" : type}
          className={cn(
            "w-full bg-transparent placeholder:text-ink-subtle text-[14.5px]",
            tone === "dark" && "placeholder:text-white/50 text-white",
            className,
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            disabled={props.disabled}
            aria-label={revealed ? "Скрыть пароль" : "Показать пароль"}
            aria-pressed={revealed}
            title={revealed ? "Скрыть пароль" : "Показать пароль"}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-btn transition-colors disabled:cursor-not-allowed",
              tone === "light" ? "text-ink-subtle hover:text-ink" : "text-white/60 hover:text-white",
            )}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
});
