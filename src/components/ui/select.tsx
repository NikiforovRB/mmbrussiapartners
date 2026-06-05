"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption<T extends string = string> = {
  value: T;
  label: React.ReactNode;
  hint?: React.ReactNode;
};

export interface SelectProps<T extends string = string> {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Выберите",
  label,
  className,
  disabled,
}: SelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className={cn("space-y-1.5", className)} ref={ref}>
      {label ? <span className="block text-[12.5px]  text-ink-muted">{label}</span> : null}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={cn(
            "field-control w-full h-12 rounded-panel bg-card-light px-4 flex items-center justify-between gap-3 text-left text-[14.5px] transition-colors",
            !current && "text-ink-subtle",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-ink-subtle" />
          </motion.span>
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="absolute z-30 mt-2 w-full rounded-panel bg-white p-2 max-h-72 overflow-auto scrollbar-clean"
              style={{ boxShadow: "0 24px 60px -24px rgba(11,16,32,0.18)" }}
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 rounded-panel px-3 py-2.5 text-sm text-left transition-colors",
                      active ? "bg-card-light" : "hover:bg-card-light/70",
                    )}
                  >
                    <span className="flex-1">
                      <span className="block">{opt.label}</span>
                      {opt.hint ? <span className="block text-xs text-ink-subtle">{opt.hint}</span> : null}
                    </span>
                    {active ? <Check className="h-4 w-4 text-accent" /> : null}
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
