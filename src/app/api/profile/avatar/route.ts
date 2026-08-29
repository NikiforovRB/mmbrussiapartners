import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, notFound, route, unauthenticated } from "@/lib/api";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const GET = route(async () => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) return NextResponse.json({ url: null });

  return NextResponse.json({ url: await getDownloadUrl(profile.avatarKey, 3600) });
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) throw badRequest("Файл не загружен");
  if (!ALLOWED.has(file.type)) throw badRequest("Допустимы JPG, PNG, WebP или GIF");
  if (file.size > MAX_SIZE) throw badRequest("Файл слишком большой (макс. 2 МБ)");

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });
  if (!profile) throw notFound("Профиль не найден");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const upload = await uploadObject("avatars", `${session.user.id}-avatar.${ext}`, buffer, file.type);

  // Ссылку на новый файл записываем первой: если апдейт упадёт, старый аватар
  // останется рабочим, а свежезалитый объект уберём, чтобы не висел сиротой.
  try {
    await db.dealerProfile.update({
      where: { userId: session.user.id },
      data: { avatarKey: upload.key },
    });
  } catch (err) {
    await deleteObject(upload.key).catch(() => {});
    throw err;
  }

  if (profile.avatarKey && profile.avatarKey !== upload.key) {
    await deleteObject(profile.avatarKey).catch((err) =>
      console.error("[avatar] не удалось удалить прежний файл", err),
    );
  }

  return NextResponse.json({ ok: true, url: await getDownloadUrl(upload.key, 3600) });
});

export const DELETE = route(async () => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) return NextResponse.json({ ok: true });

  await db.dealerProfile.update({
    where: { userId: session.user.id },
    data: { avatarKey: null },
  });
  await deleteObject(profile.avatarKey).catch((err) =>
    console.error("[avatar] не удалось удалить файл", err),
  );

  return NextResponse.json({ ok: true });
});
