import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "light" | "dark" | "glass" | "accent";

export function Card({
  className,
  tone = "light",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  const map: Record<Tone, string> = {
    light: "bg-white border border-hairline text-ink",
    dark: "bg-bg-dark text-white",
    glass: "surface-glass text-ink",
    accent: "bg-accent text-white",
  };
  return (
    <div
      className={cn(
        "rounded-panel p-6 transition-all duration-300",
        map[tone],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 mb-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg  tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3", className)} {...props} />;
}
