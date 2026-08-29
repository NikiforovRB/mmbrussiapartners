/**
 * Русские подписи статусов. Одно и то же значение перечисления читается
 * по-разному в зависимости от сущности: PENDING у представителя — «Ожидает
 * одобрения», у платежа — «Ожидает оплаты». Поэтому карты разделены.
 */

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger" | "muted";

export type StatusKind = "user" | "license" | "payment" | "request" | "receipt";

type Entry = { label: string; tone: StatusTone };

const USER: Record<string, Entry> = {
  PENDING: { label: "Ожидает одобрения", tone: "warning" },
  APPROVED: { label: "Одобрен", tone: "success" },
  REJECTED: { label: "Отклонён", tone: "danger" },
  SUSPENDED: { label: "Заблокирован", tone: "muted" },
};

const LICENSE: Record<string, Entry> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  ACTIVE: { label: "Активна", tone: "success" },
  EXPIRED: { label: "Истекла", tone: "muted" },
  CANCELLED: { label: "Аннулирована", tone: "warning" },
  REVOKED: { label: "Отозвана", tone: "danger" },
};

const PAYMENT: Record<string, Entry> = {
  PENDING: { label: "Ожидает оплаты", tone: "warning" },
  PAID: { label: "Оплачен", tone: "success" },
  FAILED: { label: "Ошибка оплаты", tone: "danger" },
  CANCELLED: { label: "Отменён", tone: "muted" },
  REFUNDED: { label: "Возвращён", tone: "neutral" },
};

const REQUEST: Record<string, Entry> = {
  PENDING: { label: "На рассмотрении", tone: "warning" },
  APPROVED: { label: "Одобрена", tone: "success" },
  REJECTED: { label: "Отклонена", tone: "muted" },
};

const RECEIPT: Record<string, Entry> = {
  wait: { label: "Чек пробивается", tone: "warning" },
  done: { label: "Чек пробит", tone: "success" },
  fail: { label: "Чек не пробит", tone: "danger" },
};

const MAPS: Record<StatusKind, Record<string, Entry>> = {
  user: USER,
  license: LICENSE,
  payment: PAYMENT,
  request: REQUEST,
  receipt: RECEIPT,
};

export function statusEntry(kind: StatusKind, status: string | null | undefined): Entry {
  if (!status) return { label: "—", tone: "muted" };
  return MAPS[kind][status] ?? { label: status, tone: "neutral" };
}

export function statusLabel(kind: StatusKind, status: string | null | undefined): string {
  return statusEntry(kind, status).label;
}
