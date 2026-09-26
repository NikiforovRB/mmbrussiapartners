import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound, route } from "@/lib/api";
import { notifyAdmins } from "@/lib/app-notifications";
import { requireApprovedUser } from "@/lib/session";
import { fioFromParts } from "@/lib/utils";

export const runtime = "nodejs";

/** Повторная заявка на публикацию телефона после отклонения. */
export const POST = route(async () => {
  const session = await requireApprovedUser();
  const userId = session.user.id;

  const profile = await db.dealerProfile.findUnique({ where: { userId } });
  if (!profile) throw notFound("Профиль представителя не найден");
  if (!profile.phoneVisibleOnSite) {
    throw badRequest("Включите «Показывать телефон на сайте» и сохраните профиль");
  }
  if (profile.sitePublication === "PENDING") throw badRequest("Заявка уже на рассмотрении");
  if (profile.sitePublication === "APPROVED") throw badRequest("Телефон уже опубликован");

  await db.dealerProfile.update({
    where: { userId },
    data: {
      sitePublication: "PENDING",
      sitePublicationAt: new Date(),
      sitePublicationById: null,
      sitePublicationNote: null,
    },
  });

  await notifyAdmins(["dealers.approve"], {
    type: "SITE_PUBLICATION_REQUESTED",
    title: "Повторная заявка на публикацию телефона",
    body: [fioFromParts(profile), profile.phone, profile.city].filter(Boolean).join(" · "),
    link: `/admin/dealers/${userId}`,
  });

  return NextResponse.json({ ok: true });
});
