import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });

  if (!profile?.avatarKey) {
    return NextResponse.json({ url: null });
  }

  const url = await getDownloadUrl(profile.avatarKey, 3600);
  return NextResponse.json({ url });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Допустимы JPG, PNG, WebP или GIF" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (макс. 2 МБ)" }, { status: 400 });
  }

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const upload = await uploadObject(
    "avatars",
    `${session.user.id}-avatar.${ext}`,
    buffer,
    file.type,
  );

  if (profile.avatarKey && profile.avatarKey !== upload.key) {
    try {
      await deleteObject(profile.avatarKey);
    } catch {
      /* ignore stale object cleanup errors */
    }
  }

  await db.dealerProfile.update({
    where: { userId: session.user.id },
    data: { avatarKey: upload.key },
  });

  const url = await getDownloadUrl(upload.key, 3600);
  return NextResponse.json({ ok: true, url });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const profile = await db.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) {
    return NextResponse.json({ ok: true });
  }

  try {
    await deleteObject(profile.avatarKey);
  } catch {
    /* ignore */
  }

  await db.dealerProfile.update({
    where: { userId: session.user.id },
    data: { avatarKey: null },
  });

  return NextResponse.json({ ok: true });
}
