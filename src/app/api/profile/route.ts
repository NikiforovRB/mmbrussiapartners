import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, forbidden, parseBody, route } from "@/lib/api";
import { fioFromParts, normalizePhone } from "@/lib/utils";
import { requireApprovedUser } from "@/lib/session";
import { hasAdminScope } from "@/lib/permissions";
import { notifyAdmins } from "@/lib/app-notifications";
import { queueDealerSiteSync } from "@/lib/site-dealers";
import { clientIp } from "@/lib/rate-limit";
import { LOCATION_TEXT_MAX, normalizeLocation, recordLocationChange } from "@/lib/dealer-location";
import { ContactFieldError, normalizeCompanyUrl, normalizeTelegramNick } from "@/lib/dealer-contacts";

export const runtime = "nodejs";

// Страну, регион и город дилер указывает при регистрации, дальше их меняет
// только администратор: по ним строится гео-аналитика и публикация на сайте.
// Сотрудник с админскими правами правит своё местоположение здесь же.
const schema = z.object({
  firstName: z.string().min(1, "Укажите имя").optional(),
  lastName: z.string().min(1, "Укажите фамилию").optional(),
  middleName: z.string().nullable().optional(),
  phone: z.string().min(6, "Укажите телефон").optional(),
  organization: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().max(LOCATION_TEXT_MAX, `Город — не длиннее ${LOCATION_TEXT_MAX} символов`).nullable().optional(),
  region: z.string().max(LOCATION_TEXT_MAX, `Регион — не длиннее ${LOCATION_TEXT_MAX} символов`).nullable().optional(),
  country: z.string().max(60, "Страна — не длиннее 60 символов").nullable().optional(),
  telegramNick: z.string().max(100).nullable().optional(),
  companyUrl: z.string().max(400).nullable().optional(),
  siteComment: z.string().max(200, "Подпись на сайте — не длиннее 200 символов").nullable().optional(),
  phoneVisibleOnSite: z.boolean().optional(),
});

export const PATCH = route(async (req: Request) => {
  const session = await requireApprovedUser();
  const userId = session.user.id;

  const d = await parseBody(req, schema);
  let contacts: { telegramNick?: string | null; companyUrl?: string | null };
  try {
    contacts = {
      ...(d.telegramNick !== undefined && { telegramNick: normalizeTelegramNick(d.telegramNick) }),
      ...(d.companyUrl !== undefined && { companyUrl: normalizeCompanyUrl(d.companyUrl) }),
    };
  } catch (e) {
    if (e instanceof ContactFieldError) throw badRequest(e.message);
    throw e;
  }

  const before = await db.dealerProfile.findUnique({
    where: { userId },
    select: { phone: true, city: true, region: true, country: true, siteComment: true, phoneVisibleOnSite: true },
  });

  const wantsLocation = d.country !== undefined || d.region !== undefined || d.city !== undefined;
  if (wantsLocation && !hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) {
    throw forbidden("Страну, регион и город меняет администратор");
  }
  const currentLocation = {
    country: before?.country ?? null,
    region: before?.region ?? null,
    city: before?.city ?? null,
  };
  const location = wantsLocation
    ? normalizeLocation(
        {
          country: d.country !== undefined ? d.country : currentLocation.country,
          region: d.region !== undefined ? d.region : currentLocation.region,
          city: d.city !== undefined ? d.city : currentLocation.city,
        },
        currentLocation,
      )
    : null;

  const next = {
    ...(d.phone !== undefined && { phone: normalizePhone(d.phone) }),
    ...(location && { city: location.city, country: location.country }),
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
      dealerProfile: {
        update: {
          ...(d.firstName !== undefined && { firstName: d.firstName }),
          ...(d.lastName !== undefined && { lastName: d.lastName }),
          ...(d.middleName !== undefined && { middleName: d.middleName || null }),
          ...(d.organization !== undefined && { organization: d.organization || null }),
          ...(d.inn !== undefined && { inn: d.inn || null }),
          ...(location && { region: location.region }),
          ...(d.address !== undefined && { address: d.address || null }),
          ...(d.phoneVisibleOnSite !== undefined && { phoneVisibleOnSite: d.phoneVisibleOnSite }),
          ...contacts,
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

  if (location && before) {
    await recordLocationChange({
      userId,
      actorId: userId,
      source: "DEALER",
      before: currentLocation,
      after: location,
      ip: clientIp(req.headers),
    });
  }

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

  return NextResponse.json({ ok: true, ...contacts });
});
