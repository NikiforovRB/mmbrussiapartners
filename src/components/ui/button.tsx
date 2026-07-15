"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "dark" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    icon,
    iconRight,
    loading,
    children,
    type = "button",
    disabled,
    ...props
  },
  ref,
) {
  const sizeMap: Record<Size, string> = {
    sm: "h-9 px-3.5 text-[13px] gap-1.5",
    md: "h-11 px-5 text-sm gap-2",
    lg: "h-12 px-6 text-[15px] gap-2",
  };

  const variantMap: Record<Variant, string> = {
    primary: "bg-accent text-white hover:bg-accent-dark active:scale-[0.985]",
    secondary: "bg-card-light text-ink hover:bg-[#dde3f0] active:scale-[0.985]",
    dark: "bg-bg-dark text-white hover:bg-[#111] active:scale-[0.985]",
    ghost: "bg-transparent text-ink hover:bg-card-light/70 active:scale-[0.985]",
    danger: "bg-danger text-white hover:bg-[#dc2626] active:scale-[0.985]",
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center rounded-btn transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeMap[size],
        variantMap[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <span
            className="block h-4 w-4 rounded-full animate-spin-slow"
            style={{
              background: "conic-gradient(currentColor, transparent)",
              maskImage: "radial-gradient(circle, transparent 50%, black 51%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 50%, black 51%)",
            }}
          />
        </span>
      ) : null}
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>
        {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
        {children}
        {iconRight ? <span className="inline-flex shrink-0">{iconRight}</span> : null}
      </span>
    </button>
  );
});
