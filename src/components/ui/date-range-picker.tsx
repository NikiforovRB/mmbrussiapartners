"use client";

import * as React from "react";
import { DatePicker } from "./date-picker";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export function DateRangePicker({
  value,
  onChange,
  fromLabel = "С",
  toLabel = "По",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  fromLabel?: string;
  toLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DatePicker
        label={fromLabel}
        value={value.from}
        onChange={(d) => onChange({ ...value, from: d })}
      />
      <DatePicker
        label={toLabel}
        value={value.to}
        onChange={(d) => onChange({ ...value, to: d })}
        min={value.from ?? undefined}
      />
    </div>
  );
}
