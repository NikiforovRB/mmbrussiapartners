"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, label, description, className }: ToggleProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300",
          checked ? "bg-accent" : "bg-hairline",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-200 ease-out",
            checked && "translate-x-5",
          )}
        />
      </button>
      {(label || description) && (
        <span className="space-y-0.5">
          {label ? <span className="block text-sm">{label}</span> : null}
          {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
        </span>
      )}
    </label>
  );
}
