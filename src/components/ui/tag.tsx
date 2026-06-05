import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "muted" | "dark";

const toneMap: Record<Tone, string> = {
  neutral: "bg-card-light text-ink",
  accent: "bg-[#dcefff] text-[#0a78d8]",
  success: "bg-[#dcfce7] text-[#16803d]",
  warning: "bg-[#fef3c7] text-[#a16207]",
  danger: "bg-[#fee2e2] text-[#991b1b]",
  muted: "bg-[#eaeef6] text-ink-muted",
  dark: "bg-bg-dark text-white",
};

export function Tag({
  className,
  tone = "neutral",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-panel px-3 py-1 text-[12px] tracking-tight",
        toneMap[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
