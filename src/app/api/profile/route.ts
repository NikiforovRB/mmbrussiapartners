import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseBody, route } from "@/lib/api";
import { fioFromParts, normalizePhone } from "@/lib/utils";
import { requireApprovedUser } from "@/lib/session";
import { notifyAdmins } from "@/lib/app-notifications";
import { queueDealerSiteSync } from "@/lib/site-dealers";

export const runtime = "nodejs";

const schema = z.object({
  firstName: z.string().min(1, "Укажите имя").optional(),
  lastName: z.string().min(1, "Укажите фамилию").optional(),
  middleName: z.string().nullable().optional(),
  phone: z.string().min(6, "Укажите телефон").optional(),
  organization: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().max(60, "Страна — не длиннее 60 символов").nullable().optional(),
  address: z.string().nullable().optional(),
  siteComment: z.string().max(200, "Подпись на сайте — не длиннее 200 символов").nullable().optional(),
  phoneVisibleOnSite: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  notifyByTelegram: z.boolean().optional(),
  telegramChatId: z.string().nullable().optional(),
});

export const PATCH = route(async (req: Request) => {
  const session = await requireApprovedUser();
  const userId = session.user.id;

  const d = await parseBody(req, schema);

  const before = await db.dealerProfile.findUnique({
    where: { userId },
    select: { phone: true, city: true, country: true, siteComment: true, phoneVisibleOnSite: true },
  });

  const next = {
    ...(d.phone !== undefined && { phone: normalizePhone(d.phone) }),
    ...(d.city !== undefined && { city: d.city || null }),
    ...(d.country !== undefined && { country: d.country?.trim() || null }),
    ...(d.siteComment !== undefined && { siteComment: d.siteComment?.trim() || null }),
  };
  const visibilityChanged =
    before !== null &&
    d.phoneVisibleOnSite !== undefined &&
    d.phoneVisibleOnSite !== before.phoneVisibleOnSite;
  const siteFieldsChanged =
    before !== null &&
    (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== before[k]);

  // Включённый тоггл — заявка администратору; выключенный — отзыв согласия,
  // телефон снимается с сайта сразу, без модерации.
  const publication = visibilityChanged
    ? {
        sitePublication: d.phoneVisibleOnSite ? ("PENDING" as const) : ("NONE" as const),
        sitePublicationAt: new Date(),
        sitePublicationById: null,
        sitePublicationNote: null,
      }
    : {};

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(d.notifyByEmail !== undefined && { notifyByEmail: d.notifyByEmail }),
      ...(d.notifyByTelegram !== undefined && { notifyByTelegram: d.notifyByTelegram }),
      ...(d.telegramChatId !== undefined && { telegramChatId: d.telegramChatId || null }),
      dealerProfile: {
        update: {
          ...(d.firstName !== undefined && { firstName: d.firstName }),
          ...(d.lastName !== undefined && { lastName: d.lastName }),
          ...(d.middleName !== undefined && { middleName: d.middleName || null }),
          ...(d.organization !== undefined && { organization: d.organization || null }),
          ...(d.inn !== undefined && { inn: d.inn || null }),
          ...(d.region !== undefined && { region: d.region || null }),
          ...(d.address !== undefined && { address: d.address || null }),
          ...(d.phoneVisibleOnSite !== undefined && { phoneVisibleOnSite: d.phoneVisibleOnSite }),
          ...next,
          ...publication,
        },
      },
    },
    select: {
      dealerProfile: {
        select: { firstName: true, lastName: true, middleName: true, phone: true, city: true },
      },
    },
  });

  if (visibilityChanged || siteFieldsChanged) queueDealerSiteSync(userId, "profile");

  const p = updated.dealerProfile;
  if (visibilityChanged && d.phoneVisibleOnSite && p) {
    await notifyAdmins(["dealers.approve"], {
      type: "SITE_PUBLICATION_REQUESTED",
      title: "Заявка на публикацию телефона на сайте",
      body: [fioFromParts(p), p.phone, p.city].filter(Boolean).join(" · "),
      link: `/admin/dealers/${userId}`,
    });
  }

  return NextResponse.json({ ok: true });
});
