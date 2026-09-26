import { NextResponse } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@/lib/db";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, parseBody, route } from "@/lib/api";
import { syncLicenseSlots } from "@/lib/license-slots";
import { changeLicensePrice, LicensePriceError } from "@/lib/license-price";
import { notifyUser } from "@/lib/app-notifications";
import { formatRub } from "@/lib/money";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const patchSchema = z.object({
  type: z.enum(["Генерация", "Обновление", "Восстановление"]).optional(),
  features: z.record(z.union([z.boolean(), z.string()])).optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
  dealerComment: z
    .string()
    .trim()
    .min(1, "Комментарий дилера не может быть пустым")
    .max(1000, "Комментарий слишком длинный")
    .optional(),
  product: z.string().trim().min(1, "Укажите продукт").max(80).optional(),
  bundle: optionalText(40),
  productRegion: optionalText(40),
  versionSoftware: optionalText(160),
  versionCustom: optionalText(60),
  price: z.number().min(0).max(10_000_000).optional(),
  basePrice: z.number().min(0).max(10_000_000).nullable().optional(),
  /** Пояснение к правке — попадёт в аудит лицензии. */
  reason: z.string().trim().max(300).optional(),
});

/**
 * Запись генерации — продукт, версии, цена, статус — правит только
 * администратор с licenses.manageTerms: право licenses.edit есть и у
 * представителя, и одного его мало. Комментарий дилера правят оба.
 */
const TERM_FIELDS = [
  "status",
  "features",
  "type",
  "product",
  "bundle",
  "productRegion",
  "versionSoftware",
  "versionCustom",
  "price",
  "basePrice",
] as const;

const FIELD_LABELS: Record<string, string> = {
  type: "тип",
  status: "статус",
  product: "продукт",
  bundle: "комплектация",
  productRegion: "регион продукта",
  versionSoftware: "версия ПО",
  versionCustom: "версия кастома",
  dealerComment: "комментарий дилера",
  basePrice: "базовая цена",
  features: "функции",
};

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license || license.deletedAt) throw notFound("Лицензия не найдена");

  // Чужую лицензию правит только администратор: licenses.edit есть и у
  // представителя, поэтому одного этого права для доступа недостаточно.
  const isOwner = license.dealerId === session.user.id;
  const isAdmin = hasAdminScope(session.user.permissions, session.user.isSuperAdmin);
  const canEdit = hasPermission(session.user.permissions, "licenses.edit", session.user.isSuperAdmin);
  const canManageTerms = hasPermission(
    session.user.permissions,
    "licenses.manageTerms",
    session.user.isSuperAdmin,
  );
  if (!isOwner && !(isAdmin && canEdit)) throw forbidden();

  const data = await parseBody(req, patchSchema);

  if (!(isAdmin && canManageTerms)) {
    const attempted = TERM_FIELDS.filter((f) => data[f] !== undefined);
    if (attempted.length > 0) {
      throw forbidden("Запись генерации, стоимость и статус лицензии меняет администратор");
    }
  }

  const update: Prisma.LicenseUpdateInput = {};
  const changed: string[] = [];
  const assign = <K extends keyof typeof FIELD_LABELS>(key: K, next: unknown, current: unknown) => {
    if (next === undefined || next === current) return;
    (update as Record<string, unknown>)[key] = next;
    changed.push(FIELD_LABELS[key]);
  };
  assign("type", data.type, license.type);
  assign("product", data.product, license.product);
  assign("bundle", data.bundle, license.bundle);
  assign("productRegion", data.productRegion, license.productRegion);
  assign("versionSoftware", data.versionSoftware, license.versionSoftware);
  assign("versionCustom", data.versionCustom, license.versionCustom);
  assign("dealerComment", data.dealerComment, license.dealerComment);
  if (data.features !== undefined) assign("features", data.features, null);
  if (data.basePrice !== undefined) {
    const current = license.basePrice === null ? null : Number(license.basePrice);
    assign("basePrice", data.basePrice, current);
  }
  if (data.status !== undefined && data.status !== license.status) {
    assign("status", data.status, license.status);
    if (data.status === "CANCELLED") {
      update.cancelledAt = new Date();
      update.cancellationReason = data.reason || "Аннулирована администратором";
    } else {
      update.cancelledAt = null;
      update.cancellationReason = null;
    }
  }

  const before = license;
  if (Object.keys(update).length > 0) {
    await db.license.update({ where: { id }, data: update });
  }

  let priceNote: string | null = null;
  if (data.price !== undefined) {
    const current = license.price === null ? null : Number(license.price);
    if (current !== data.price) {
      try {
        const res = await changeLicensePrice(id, data.price);
        const paymentNote =
          res.payment === "cancelled"
            ? "счёт отменён"
            : res.payment === "created"
              ? "выставлен счёт"
              : res.payment === "updated"
                ? "сумма счёта изменена"
                : null;
        priceNote = `стоимость ${res.before === null ? "—" : formatRub(res.before)} → ${formatRub(res.after)}${paymentNote ? ` (${paymentNote})` : ""}`;
        changed.push(priceNote);
        await notifyUser(license.dealerId, {
          type: "PAYMENT_CREATED",
          title: `Стоимость лицензии ${license.number} изменена`,
          body:
            `${res.before === null ? "" : `${formatRub(res.before)} → `}${formatRub(res.after)}` +
            (res.payment === "cancelled"
              ? ". Оплачивать лицензию не нужно — счёт отменён."
              : res.payment === "created"
                ? ". Выставлен счёт на оплату."
                : res.payment === "updated"
                  ? ". Сумма счёта пересчитана."
                  : ""),
          link: `/dealer/licenses/${license.id}`,
        });
      } catch (err) {
        if (err instanceof LicensePriceError) throw badRequest(err.message);
        throw err;
      }
    }
  }

  if (changed.length === 0) return NextResponse.json({ ok: true, changed: [] });

  if (update.status !== undefined) await syncLicenseSlots(license.dealerId);

  const after = await db.license.findUnique({ where: { id } });
  const summary = `Изменено: ${changed.join(", ")}`;
  await db.licenseAuditLog.create({
    data: {
      licenseId: id,
      actorId: session.user.id,
      action: data.status === "CANCELLED" && before.status !== "CANCELLED" ? "CANCELLED" : "EDITED",
      reason: data.reason ? `${summary}. ${data.reason}` : summary,
      diff: JSON.parse(JSON.stringify({ before, after })),
    },
  });

  return NextResponse.json({ ok: true, changed });
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) throw notFound("Лицензия не найдена");
  if (license.deletedAt) return NextResponse.json({ ok: true });

  const canDelete = hasPermission(
    session.user.permissions,
    "licenses.delete",
    session.user.isSuperAdmin,
  );
  if (!canDelete) throw forbidden();

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  await db.$transaction([
    db.license.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.licenseAuditLog.create({
      data: { licenseId: id, actorId: session.user.id, action: "DELETED", reason },
    }),
  ]);

  // Удалённая лицензия перестаёт занимать слот лимита представителя.
  await syncLicenseSlots(license.dealerId);

  return NextResponse.json({ ok: true });
});
