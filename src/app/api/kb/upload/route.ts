import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { uploadObject } from "@/lib/s3";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Загрузка изображения для статьи базы знаний. Возвращает ключ объекта в S3.
export const POST = route(async (req: Request) => {
  await requirePermission("settings.edit");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Файл не загружен");
  if (!ALLOWED.has(file.type)) throw badRequest("Допустимы JPG, PNG, WebP или GIF");
  if (file.size > MAX_SIZE) throw badRequest("Файл слишком большой (макс. 8 МБ)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const upload = await uploadObject("knowledge", `kb-${Date.now()}.${ext}`, buffer, file.type);

  return NextResponse.json({ key: upload.key });
});
