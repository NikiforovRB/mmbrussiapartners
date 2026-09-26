import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound, route } from "@/lib/api";
import { notifyAdmins } from "@/lib/app-notifications";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Представитель отправляет заявку на подключение к личному кабинету DriveMods.
 * Мы только фиксируем время заявки и уведомляем администраторов — сам доступ
 * выдаёт администратор вручную (флаг в профиле представителя).
 */
export const POST = route(async () => {
  const session = await requireApprovedUser();

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    include: { user: { select: { email: true } } },
  });
  if (!profile) throw notFound("Профиль представителя не найден");
  if (profile.driveModsAccess) throw badRequest("Доступ уже предоставлен");

  await db.dealerProfile.update({
    where: { userId: session.user.id },
    data: { driveModsRequestedAt: new Date() },
  });

  await notifyAdmins(["dealers.edit", "dealers.approve"], {
    // Отдельного типа для этого события нет — используем dealer-событие; смысл
    // несёт заголовок. Так избегаем миграции enum ради одной строки.
    type: "DEALER_REGISTERED",
    title: "Запрос доступа к ЛК DriveMods",
    body: `${profile.user.email} запросил доступ к личному кабинету DriveMods`,
    link: `/admin/dealers/${session.user.id}`,
  });

  return NextResponse.json({ ok: true });
});
