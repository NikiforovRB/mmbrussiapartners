import "server-only";

import type { DealerProfile, UserStatus } from "@prisma/client";
import { db } from "./db";
import { hasPermission, type PermissionKey } from "./permissions";

/** Заголовок события «дилер запросил доступ к ЛК DriveMods»: отдельного типа у него нет. */
export const DRIVEMODS_REQUEST_TITLE = "Запрос доступа к ЛК DriveMods";

export type NotificationActionKind = "registration" | "drivemods" | "site";
export type NotificationActionState = "pending" | "approved" | "rejected" | "closed";
export type NotificationAction = {
  kind: NotificationActionKind;
  dealerId: string;
  state: NotificationActionState;
};

type ActionSource = { id: string; type: string; title: string; link: string | null };
type ActionProfile = Pick<
  DealerProfile,
  "sitePublication" | "driveModsAccess" | "driveModsRequestedAt" | "driveModsRejectedAt"
>;

const DEALER_LINK = /^\/admin\/dealers\/([^/?#]+)$/;

function kindOf(n: ActionSource): NotificationActionKind | null {
  if (n.type === "SITE_PUBLICATION_REQUESTED") return "site";
  if (n.type === "DEALER_REGISTERED") return n.title === DRIVEMODS_REQUEST_TITLE ? "drivemods" : "registration";
  return null;
}

function stateOf(kind: NotificationActionKind, status: UserStatus, p: ActionProfile): NotificationActionState {
  if (kind === "registration") {
    if (status === "PENDING") return "pending";
    if (status === "APPROVED") return "approved";
    return status === "REJECTED" ? "rejected" : "closed";
  }
  if (kind === "site") {
    if (p.sitePublication === "PENDING") return "pending";
    if (p.sitePublication === "APPROVED") return "approved";
    return p.sitePublication === "REJECTED" ? "rejected" : "closed";
  }
  if (p.driveModsAccess) return "approved";
  if (p.driveModsRequestedAt) return "pending";
  return p.driveModsRejectedAt ? "rejected" : "closed";
}

/**
 * Решения по заявкам дилеров прямо в панели уведомлений. Состояние берётся у
 * дилера сейчас, а не из события: заявку мог уже рассмотреть другой
 * администратор, и тогда вместо кнопок виден итог.
 */
export async function notificationActions(
  items: ActionSource[],
  user: { permissions: readonly string[]; isSuperAdmin: boolean },
): Promise<Map<string, NotificationAction>> {
  const can = (p: PermissionKey) => hasPermission(user.permissions, p, user.isSuperAdmin);
  const allowed: Record<NotificationActionKind, boolean> = {
    registration: can("dealers.approve"),
    site: can("dealers.approve"),
    drivemods: can("dealers.approve") || can("dealers.edit"),
  };
  const wanted = items.flatMap((n) => {
    const kind = kindOf(n);
    const dealerId = n.link?.match(DEALER_LINK)?.[1];
    return kind && dealerId && allowed[kind] ? [{ id: n.id, kind, dealerId }] : [];
  });
  const out = new Map<string, NotificationAction>();
  if (wanted.length === 0) return out;

  const dealers = await db.user.findMany({
    where: { id: { in: [...new Set(wanted.map((w) => w.dealerId))] } },
    select: {
      id: true,
      status: true,
      dealerProfile: {
        select: {
          sitePublication: true,
          driveModsAccess: true,
          driveModsRequestedAt: true,
          driveModsRejectedAt: true,
        },
      },
    },
  });
  const byId = new Map(dealers.map((d) => [d.id, d]));
  for (const w of wanted) {
    const dealer = byId.get(w.dealerId);
    if (!dealer?.dealerProfile) continue;
    out.set(w.id, { kind: w.kind, dealerId: w.dealerId, state: stateOf(w.kind, dealer.status, dealer.dealerProfile) });
  }
  return out;
}
