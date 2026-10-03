import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, forbidden, notFound, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function loadTarget(id: string, actorIsSuperAdmin: boolean) {
  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, isSuperAdmin: true, dealerProfile: { select: { avatarKey: true } } },
  });
  if (!target) throw notFound("Пользователь не найден");
  if (target.isSuperAdmin && !actorIsSuperAdmin) {
    throw forbidden("Изменять суперадминистратора может только суперадминистратор.");
  }
  return target;
}

/** Фото сотрудника из раздела «Пользователи». */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("users.manage");
  const { id } = await ctx.params;
  const target = await loadTarget(id, session.user.isSuperAdmin);

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) throw badRequest("Файл не загружен");
  if (!ALLOWED.has(file.type)) throw badRequest("Допустимы JPG, PNG, WebP или GIF");
  if (file.size > MAX_SIZE) throw badRequest("Файл слишком большой (макс. 2 МБ)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const upload = await uploadObject("avatars", `${id}-avatar.${ext}`, buffer, file.type);

  // Фото хранится в профиле; у сотрудника без ФИО и телефона его ещё нет.
  try {
    await db.dealerProfile.upsert({
      where: { userId: id },
      update: { avatarKey: upload.key },
      create: { userId: id, firstName: "", lastName: "", phone: "", avatarKey: upload.key },
    });
  } catch (err) {
    await deleteObject(upload.key).catch(() => {});
    throw err;
  }

  const previous = target.dealerProfile?.avatarKey;
  if (previous && previous !== upload.key) {
    await deleteObject(previous).catch((err) =>
      console.error("[user-avatar] не удалось удалить прежний файл", err),
    );
  }

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: "USER_PROFILE_UPDATED",
    summary: `${target.email} · обновлено фото профиля`,
  });

  return NextResponse.json({ ok: true, url: await getDownloadUrl(upload.key, 3600) });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("users.manage");
  const { id } = await ctx.params;
  const target = await loadTarget(id, session.user.isSuperAdmin);

  const key = target.dealerProfile?.avatarKey;
  if (!key) return NextResponse.json({ ok: true });

  await db.dealerProfile.update({ where: { userId: id }, data: { avatarKey: null } });
  await deleteObject(key).catch((err) => console.error("[user-avatar] не удалось удалить файл", err));

  await recordAdminAction({
    actorId: session.user.id,
    entity: "ROLE",
    entityId: id,
    action: "USER_PROFILE_UPDATED",
    summary: `${target.email} · удалено фото профиля`,
  });

  return NextResponse.json({ ok: true });
});
