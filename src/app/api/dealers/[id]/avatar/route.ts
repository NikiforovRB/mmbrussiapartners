import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, notFound, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Администратор с правом dealers.edit загружает фото профиля представителя. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.edit", "Нет права редактировать представителей");
  const { id } = await ctx.params;

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) throw badRequest("Файл не загружен");
  if (!ALLOWED.has(file.type)) throw badRequest("Допустимы JPG, PNG, WebP или GIF");
  if (file.size > MAX_SIZE) throw badRequest("Файл слишком большой (макс. 2 МБ)");

  const profile = await db.dealerProfile.findUnique({
    where: { userId: id },
    select: { avatarKey: true },
  });
  if (!profile) throw notFound("Профиль не найден");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const upload = await uploadObject("avatars", `${id}-avatar.${ext}`, buffer, file.type);

  try {
    await db.dealerProfile.update({ where: { userId: id }, data: { avatarKey: upload.key } });
  } catch (err) {
    await deleteObject(upload.key).catch(() => {});
    throw err;
  }

  if (profile.avatarKey && profile.avatarKey !== upload.key) {
    await deleteObject(profile.avatarKey).catch((err) =>
      console.error("[dealer-avatar] не удалось удалить прежний файл", err),
    );
  }

  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: "PROFILE_UPDATED",
    summary: "Обновлено фото профиля",
  });

  return NextResponse.json({ ok: true, url: await getDownloadUrl(upload.key, 3600) });
});

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.edit", "Нет права редактировать представителей");
  const { id } = await ctx.params;

  const profile = await db.dealerProfile.findUnique({
    where: { userId: id },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) return NextResponse.json({ ok: true });

  await db.dealerProfile.update({ where: { userId: id }, data: { avatarKey: null } });
  await deleteObject(profile.avatarKey).catch((err) =>
    console.error("[dealer-avatar] не удалось удалить файл", err),
  );

  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: "PROFILE_UPDATED",
    summary: "Удалено фото профиля",
  });

  return NextResponse.json({ ok: true });
});
