import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound, parseBody, route } from "@/lib/api";
import { changedFields, recordAdminAction } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
import { requirePermission } from "@/lib/session";
import {
  isPublishedOnSite,
  isSiteSyncConfigured,
  normalizeSiteCities,
  queueDealerSiteSync,
  siteCitiesOf,
  syncDealerToSiteNow,
} from "@/lib/site-dealers";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject", "resync", "cities"]),
  note: z.string().trim().max(500, "Не длиннее 500 символов").nullable().optional(),
  cities: z
    .array(z.string().trim().max(100, "Название города — не длиннее 100 символов"))
    .max(20, "Не больше 20 городов")
    .optional(),
});

/**
 * Модерация публикации телефона: одобрить (в том числе от имени дилера,
 * если он уже есть на сайте), отклонить заявку или снять с сайта, отправить
 * заново, задать города, в которых телефон стоит на сайте.
 */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.approve", "Нет права модерировать публикацию на сайте");
  const { id } = await ctx.params;
  const d = await parseBody(req, schema);

  const target = await db.user.findUnique({ where: { id }, include: { dealerProfile: true } });
  const profile = target?.dealerProfile;
  if (!target || !profile) throw notFound("Дилер не найден");

  if (d.action === "resync") {
    if (!isSiteSyncConfigured()) throw badRequest("Интеграция с сайтом не настроена");
    const outcome = await syncDealerToSiteNow(id, "manual");
    return NextResponse.json({ ok: true, outcome });
  }

  if (d.action === "cities") {
    const next = normalizeSiteCities(d.cities ?? [], profile.city);
    if (siteCitiesOf({ city: profile.city, siteCities: next }).length === 0) {
      throw badRequest("Укажите хотя бы один город: у дилера нет города в профиле");
    }
    await db.dealerProfile.update({ where: { userId: id }, data: { siteCities: next } });
    queueDealerSiteSync(id, "publication");
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: id,
      action: "SITE_CITIES_CHANGED",
      summary: target.email,
      diff: changedFields(
        { siteCities: siteCitiesOf(profile).join(", ") },
        { siteCities: siteCitiesOf({ city: profile.city, siteCities: next }).join(", ") },
      ),
    });
    return NextResponse.json({ ok: true, live: isPublishedOnSite(target.status, profile) });
  }

  const before = {
    phoneVisibleOnSite: profile.phoneVisibleOnSite,
    sitePublication: profile.sitePublication,
    sitePublicationNote: profile.sitePublicationNote,
  };

  if (d.action === "approve") {
    if (!profile.phone.trim()) throw badRequest("У дилера не указан телефон");
    if (siteCitiesOf(profile).length === 0) {
      throw badRequest("Укажите город дилера: без него сайт не примет телефон");
    }
    if (profile.sitePublication === "APPROVED" && profile.phoneVisibleOnSite) {
      throw badRequest("Публикация уже одобрена");
    }
    const after = {
      phoneVisibleOnSite: true,
      sitePublication: "APPROVED" as const,
      sitePublicationNote: null,
    };
    await db.dealerProfile.update({
      where: { userId: id },
      data: { ...after, sitePublicationAt: new Date(), sitePublicationById: session.user.id },
    });
    queueDealerSiteSync(id, "publication");
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: id,
      action: "SITE_PUBLICATION_APPROVED",
      summary: target.email,
      diff: changedFields(before, after),
    });
    await notifyUser(id, {
      type: "SITE_PUBLICATION_REVIEWED",
      title: "Телефон опубликован на сайте",
      body: "Он появится в «Дилерской сети» на mmbrussia.ru/contacts.",
      link: "/dealer/profile",
    });
    return NextResponse.json({
      ok: true,
      live: isPublishedOnSite(target.status, { ...profile, ...after }),
    });
  }

  if (profile.sitePublication !== "PENDING" && profile.sitePublication !== "APPROVED") {
    throw badRequest("Заявки на публикацию нет");
  }
  const wasApproved = profile.sitePublication === "APPROVED";
  const after = { sitePublication: "REJECTED" as const, sitePublicationNote: d.note || null };
  await db.dealerProfile.update({
    where: { userId: id },
    data: { ...after, sitePublicationAt: new Date(), sitePublicationById: session.user.id },
  });
  queueDealerSiteSync(id, "publication");
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: wasApproved ? "SITE_PUBLICATION_REVOKED" : "SITE_PUBLICATION_REJECTED",
    summary: target.email,
    diff: changedFields(before, after),
  });
  await notifyUser(id, {
    type: "SITE_PUBLICATION_REVIEWED",
    title: wasApproved ? "Телефон снят с сайта" : "Заявка на публикацию телефона отклонена",
    body: d.note || null,
    link: "/dealer/profile",
  });
  return NextResponse.json({ ok: true, live: false });
});
