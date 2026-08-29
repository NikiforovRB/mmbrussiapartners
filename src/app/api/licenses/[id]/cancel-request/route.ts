import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { badRequest, conflict, forbidden, notFound, parseBody, route, unauthenticated } from "@/lib/api";
import { notifyAdminsCancellationRequest } from "@/lib/notifications";
import { notifyAdmins } from "@/lib/app-notifications";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(10, "Минимум 10 символов") });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const { reason } = await parseBody(req, schema);

  const license = await db.license.findUnique({ where: { id }, include: { dealer: true } });
  if (!license) throw notFound("Лицензия не найдена");

  // Заявку подаёт владелец лицензии; администратору она не нужна —
  // он аннулирует напрямую, но доступ оставляем для разбора спорных случаев.
  const isOwner = license.dealerId === session.user.id;
  const canRequest =
    isOwner || hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!canRequest) throw forbidden();

  if (license.status !== "ACTIVE") {
    throw badRequest("Заявку можно подать только по активной лицензии");
  }

  const existing = await db.cancellationRequest.findFirst({
    where: { licenseId: license.id, status: "PENDING" },
  });
  if (existing) throw conflict("По этой лицензии уже есть заявка на рассмотрении");

  const request = await db.cancellationRequest.create({
    data: { licenseId: license.id, requestedById: session.user.id, reason },
  });

  await notifyAdminsCancellationRequest({
    licenseNumber: license.number,
    dealerEmail: license.dealer.email,
    reason,
  });
  await notifyAdmins(["licenses.cancel"], {
    type: "CANCELLATION_REQUESTED",
    title: `Заявка на аннулирование ${license.number}`,
    body: `${license.dealer.email}: ${reason}`,
    link: "/admin/cancellation-requests",
  });

  return NextResponse.json({ ok: true, requestId: request.id });
});
