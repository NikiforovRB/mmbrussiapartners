import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, conflict, forbidden, notFound, parseBody, route } from "@/lib/api";
import { notifyAdmins } from "@/lib/app-notifications";
import { formatRub } from "@/lib/money";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  reason: z.string().trim().min(10, "Минимум 10 символов").max(2000),
  kind: z.enum(["CANCEL", "REFUND"]).default("CANCEL"),
  /** Клиент отказался от генерации — повод для возврата и по неоплаченной лицензии. */
  clientRefused: z.boolean().default(false),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const { reason, kind, clientRefused } = await parseBody(req, schema);

  const license = await db.license.findUnique({
    where: { id },
    include: { dealer: true, payment: { select: { status: true, amount: true } } },
  });
  if (!license) throw notFound("Лицензия не найдена");

  // Заявку подаёт владелец лицензии; администратору она не нужна —
  // он аннулирует напрямую, но доступ оставляем для разбора спорных случаев.
  const isOwner = license.dealerId === session.user.id;
  const canRequest =
    isOwner || hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!canRequest) throw forbidden();

  const paid = license.payment?.status === "PAID";
  if (kind === "REFUND") {
    if (license.payment?.status === "REFUNDED") throw badRequest("По этой лицензии деньги уже возвращены");
    if (!paid) {
      if (license.status !== "ACTIVE") throw badRequest("Лицензия не активна и не оплачена — возвращать нечего");
      if (!license.payment && !(Number(license.price ?? 0) > 0)) {
        throw badRequest("Лицензия бесплатная — возвращать нечего. Запросите аннулирование");
      }
      if (!clientRefused) {
        throw badRequest("Возврат по неоплаченной лицензии — только если клиент отказался от генерации");
      }
    }
  } else if (license.status !== "ACTIVE") {
    throw badRequest("Заявку можно подать только по активной лицензии");
  }

  const existing = await db.cancellationRequest.findFirst({
    where: { licenseId: license.id, status: "PENDING" },
  });
  if (existing) throw conflict("По этой лицензии уже есть заявка на рассмотрении");

  const request = await db.cancellationRequest.create({
    data: { licenseId: license.id, requestedById: session.user.id, reason, kind, clientRefused },
  });

  const isRefund = kind === "REFUND";
  const details = [
    isRefund && paid && license.payment ? `оплачено ${formatRub(Number(license.payment.amount))}` : "",
    isRefund && !paid ? "не оплачена" : "",
    clientRefused ? "клиент отказался" : "",
  ].filter(Boolean);
  await notifyAdmins(["licenses.cancel"], {
    type: "CANCELLATION_REQUESTED",
    title: `${isRefund ? "Заявка на возврат" : "Заявка на аннулирование"} ${license.number}`,
    body: `${license.dealer.email}${details.length ? ` (${details.join(", ")})` : ""}: ${reason}`,
    link: `/admin/licenses/${license.id}`,
  });

  return NextResponse.json({ ok: true, requestId: request.id });
});

// Отзыв заявки дилером, пока она «на рассмотрении». Забираем именно
// свою активную заявку — так дилер может передумать и подать её заново.
export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApprovedUser();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id }, include: { dealer: true } });
  if (!license) throw notFound("Лицензия не найдена");

  const isOwner = license.dealerId === session.user.id;
  const canManage = hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!isOwner && !canManage) throw forbidden();

  const pending = await db.cancellationRequest.findFirst({
    where: {
      licenseId: license.id,
      status: "PENDING",
      // Владелец отзывает только собственную заявку.
      ...(isOwner && !canManage ? { requestedById: session.user.id } : {}),
    },
  });
  if (!pending) throw notFound("Активная заявка не найдена");

  await db.cancellationRequest.delete({ where: { id: pending.id } });

  await notifyAdmins(["licenses.cancel"], {
    type: "CANCELLATION_REQUESTED",
    title: `${pending.kind === "REFUND" ? "Заявка на возврат" : "Заявка на аннулирование"} ${license.number} отменена`,
    body: `${license.dealer.email} отменил заявку`,
    link: "/admin/cancellation-requests",
  });

  return NextResponse.json({ ok: true });
});
