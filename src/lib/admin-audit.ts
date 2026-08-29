import "server-only";

import type { AuditEntity, Prisma } from "@prisma/client";
import { db } from "./db";

type AuditInput = {
  actorId: string;
  entity: AuditEntity;
  entityId: string;
  /** Короткий машинный код действия: APPROVED, ROLE_CHANGED, PAID и т.п. */
  action: string;
  summary?: string | null;
  diff?: Record<string, Prisma.JsonValue> | null;
};

/**
 * Журнал действий над представителями, ролями, платежами и настройками.
 * По лицензиям история пишется в LicenseAuditLog, привязанный к карточке.
 *
 * Запись в журнал не должна ронять основное действие, поэтому ошибки гасим.
 */
export async function recordAdminAction(input: AuditInput): Promise<void> {
  try {
    await db.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        summary: input.summary ?? null,
        ...(input.diff != null ? { diff: input.diff as Prisma.InputJsonObject } : {}),
      },
    });
  } catch (err) {
    console.error("[audit] не удалось записать действие администратора", err);
  }
}

/** Возвращает только реально изменившиеся поля — чтобы diff не раздувался. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, Prisma.JsonValue> {
  const diff: Record<string, Prisma.JsonValue> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (prev instanceof Date || next instanceof Date) {
      const a = prev instanceof Date ? prev.getTime() : prev;
      const b = next instanceof Date ? next.getTime() : next;
      if (a !== b) diff[key] = { from: toJson(prev), to: toJson(next) };
      continue;
    }
    if (prev !== next) diff[key] = { from: toJson(prev), to: toJson(next) };
  }
  return diff;
}

/** Приводит значение поля к тому, что Postgres примет в колонку jsonb. */
function toJson(value: unknown): Prisma.JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}
