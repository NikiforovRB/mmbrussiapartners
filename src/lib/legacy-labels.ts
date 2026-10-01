/** Подписи исходных типов записей старого ЛК DriveMods. */
export const LK_TYPE_LABEL: Record<number, string> = {
  1: "Купон",
  2: "Лицензия",
  3: "Услуга",
  4: "Оплата из учётки",
  5: "Внешняя оплата",
  7: "Комментарий",
  8: "Пароль",
};

export const LEGACY_PAYMENT_LABEL: Record<string, string> = {
  PAID: "Оплачено",
  PENDING: "В процессе",
  UNPAID: "Не оплачено",
};

export const legacyPaymentTone = (status: string) =>
  status === "PAID" ? ("success" as const) : status === "PENDING" ? ("warning" as const) : ("danger" as const);

/** «HM-GEN5W · FULL · EU» — позиция лицензии одной строкой. */
export const legacyPosition = (r: { product: string | null; bundle: string | null; region: string | null }) =>
  [r.product, r.bundle, r.region].filter(Boolean).join(" · ") || "—";
