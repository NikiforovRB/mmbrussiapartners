"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
  description,
  className,
  size = "md",
}: CheckboxProps) {
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
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
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative rounded-btn transition-colors duration-200 grid place-items-center shrink-0 mt-0.5",
          dim,
          checked ? "bg-accent" : "bg-white border border-hairline",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 text-white transition duration-150 ease-out",
            checked ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        >
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
