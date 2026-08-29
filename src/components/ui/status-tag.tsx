import * as React from "react";
import { Tag } from "@/components/ui/tag";
import { statusEntry, type StatusKind } from "@/lib/status-labels";

export function StatusTag({
  kind,
  status,
  className,
}: {
  kind: StatusKind;
  status: string | null | undefined;
  className?: string;
}) {
  const { label, tone } = statusEntry(kind, status);
  return (
    <Tag tone={tone} className={className}>
      {label}
    </Tag>
  );
}
