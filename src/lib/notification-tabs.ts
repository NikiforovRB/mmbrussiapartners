import type { AppNotificationType } from "@prisma/client";

export type NotificationTabId = "all" | "dealers" | "licenses" | "payments";

type TabDef = {
  id: Exclude<NotificationTabId, "all">;
  /** Подпись в админке и у представителя: у дилера эти события — про его учётку. */
  label: { admin: string; dealer: string };
  types: AppNotificationType[];
};

export const NOTIFICATION_TAB_TYPES: TabDef[] = [
  {
    id: "dealers",
    label: { admin: "Представители", dealer: "Аккаунт" },
    types: [
      "DEALER_REGISTERED",
      "DEALER_APPROVED",
      "DEALER_REJECTED",
      "DEALER_SUSPENDED",
      "SITE_PUBLICATION_REQUESTED",
      "SITE_PUBLICATION_REVIEWED",
    ],
  },
  {
    id: "licenses",
    label: { admin: "Лицензии", dealer: "Лицензии" },
    types: [
      "LICENSE_ISSUED",
      "LICENSE_CANCELLED",
      "LICENSE_REVOKED",
      "CANCELLATION_REQUESTED",
      "CANCELLATION_REVIEWED",
    ],
  },
  {
    id: "payments",
    label: { admin: "Оплаты", dealer: "Оплаты" },
    types: ["PAYMENT_CREATED", "PAYMENT_PAID", "PAYMENT_REFUNDED", "RECEIPT_FAILED", "PRICE_MISSING"],
  },
];

/** Порядок вкладок: в админке чаще всего приходят заявки представителей. */
export function notificationTabs(admin: boolean): { id: NotificationTabId; label: string }[] {
  const order: NotificationTabDefId[] = admin ? ["dealers", "licenses", "payments"] : ["licenses", "payments", "dealers"];
  return [
    { id: "all", label: "Все" },
    ...order.map((id) => {
      const tab = NOTIFICATION_TAB_TYPES.find((t) => t.id === id)!;
      return { id, label: admin ? tab.label.admin : tab.label.dealer };
    }),
  ];
}

type NotificationTabDefId = TabDef["id"];

export function typesForTab(tab: NotificationTabId): AppNotificationType[] | null {
  if (tab === "all") return null;
  return NOTIFICATION_TAB_TYPES.find((t) => t.id === tab)?.types ?? null;
}

export function tabForType(type: string): NotificationTabDefId | null {
  return NOTIFICATION_TAB_TYPES.find((t) => (t.types as string[]).includes(type))?.id ?? null;
}

export function isNotificationTab(value: unknown): value is NotificationTabId {
  return value === "all" || NOTIFICATION_TAB_TYPES.some((t) => t.id === value);
}
