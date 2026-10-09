import { NextResponse } from "next/server";
import { z } from "zod";
import { forbidden, parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
import { markLicensePaid, type LicensePaidMark } from "@/lib/license-price";
import { formatRub } from "@/lib/money";
import { hasAdminScope } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { plural } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Выберите лицензии").max(500, "Не больше 500 лицензий за раз"),
  /** Одна сумма для всех; без неё — сумма счёта, иначе цена лицензии. */
  amount: z.number().min(0, "Сумма не может быть отрицательной").max(100_000_000).nullable().optional(),
});

/**
 * Отмечает лицензии оплаченными: деньги получены мимо онлайн-оплаты.
 * Чеки не пробиваются. Ошибка по одной лицензии не останавливает остальные.
 */
export const POST = route(async (req: Request) => {
  const session = await requirePermission("payments.manage", "Нет права отмечать оплату");
  if (!hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) {
    throw forbidden("Отмечать оплату может только администратор");
  }
  const { ids, amount } = await parseBody(req, schema);

  const marked: LicensePaidMark[] = [];
  const errors: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const result = await markLicensePaid(id, { actorId: session.user.id, amount });
      if (result.changed) marked.push(result);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const byDealer = new Map<string, LicensePaidMark[]>();
  for (const m of marked) byDealer.set(m.dealerId, [...(byDealer.get(m.dealerId) ?? []), m]);
  for (const [dealerId, list] of byDealer) {
    const total = list.reduce((sum, m) => sum + m.amount, 0);
    await notifyUser(dealerId, {
      type: "PAYMENT_PAID",
      title:
        list.length === 1
          ? `Оплата подтверждена: ${formatRub(total)}`
          : `Оплата подтверждена по ${list.length} ${plural(list.length, ["лицензии", "лицензиям", "лицензиям"])}`,
      body: list.map((m) => m.number).slice(0, 10).join(", ") + (list.length > 10 ? "…" : ""),
      link: "/dealer/licenses",
    });
  }

  if (marked.length > 0) {
    await recordAdminAction({
      actorId: session.user.id,
      entity: "PAYMENT",
      entityId: marked[0].number,
      action: "CONFIRMED",
      summary: `Отмечено оплаченными: ${marked.length} ${plural(marked.length, ["лицензия", "лицензии", "лицензий"])} на ${formatRub(
        marked.reduce((sum, m) => sum + m.amount, 0),
      )}, без чеков`,
      diff: { licenses: marked.map((m) => `${m.number}: ${m.amount}`) },
    });
  }

  return NextResponse.json({ ok: true, marked: marked.length, skipped: ids.length - marked.length - errors.length, errors });
});
