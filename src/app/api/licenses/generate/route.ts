import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadObject, getDownloadUrl } from "@/lib/s3";
import { generateLicense, validateDeviceIdFile } from "@/lib/license-engine";
import { generateLicenseNumber, normalizePhone } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  type: z.enum(["ECO", "FULL", "CUSTOM"]),
  features: z.string(),
  termStart: z.string(),
  termEnd: z.string(),
  customerFio: z.string().min(1),
  customerOrganization: z.string().optional().nullable(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional().or(z.literal("")),
  customerRegion: z.string().optional().or(z.literal("")),
  customerCity: z.string().optional().or(z.literal("")),
  vehicleVin: z.string().optional().or(z.literal("")),
  vehicleModel: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (session.user.status !== "APPROVED") {
    return NextResponse.json({ error: "Аккаунт не одобрен" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("device");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Не загружен файл device-id.bin" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDeviceIdFile(buf);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });

  const raw = Object.fromEntries(form.entries()) as Record<string, string>;
  const parsed = paramsSchema.safeParse({
    type: raw.type,
    features: raw.features,
    termStart: raw.termStart,
    termEnd: raw.termEnd,
    customerFio: raw.customerFio,
    customerOrganization: raw.customerOrganization,
    customerEmail: raw.customerEmail,
    customerPhone: raw.customerPhone,
    customerRegion: raw.customerRegion,
    customerCity: raw.customerCity,
    vehicleVin: raw.vehicleVin,
    vehicleModel: raw.vehicleModel,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Неверные параметры" }, { status: 400 });
  }
  const params = parsed.data;
  const features = safeJson(params.features);

  const dealer = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true },
  });
  if (!dealer || !dealer.dealerProfile) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 400 });
  }
  const remaining = dealer.dealerProfile.licenseLimit - dealer.dealerProfile.licensesUsed;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Лимит лицензий исчерпан" }, { status: 403 });
  }

  const termStart = new Date(params.termStart);
  const termEnd = new Date(params.termEnd);
  if (Number.isNaN(termStart.getTime()) || Number.isNaN(termEnd.getTime()) || termEnd <= termStart) {
    return NextResponse.json({ error: "Некорректный срок действия" }, { status: 400 });
  }

  const licenseNumber = await uniqueLicenseNumber();

  const deviceIdUpload = await uploadObject(
    "deviceIds",
    `${licenseNumber}-device-id.bin`,
    buf,
    "application/octet-stream",
  );

  const generated = await generateLicense(buf, {
    licenseNumber,
    type: params.type,
    features,
    termStart,
    termEnd,
    customerFio: params.customerFio,
    customerOrganization: params.customerOrganization,
    vehicleVin: params.vehicleVin || null,
  });
  const licenseUpload = await uploadObject(
    "licenses",
    `${licenseNumber}-device-license.bin`,
    generated.buffer,
    "application/octet-stream",
  );

  const license = await db.$transaction(async (tx) => {
    const created = await tx.license.create({
      data: {
        number: licenseNumber,
        dealerId: dealer.id,
        type: params.type,
        status: "ACTIVE",
        features,
        termStart,
        termEnd,
        deviceId: extractHexId(buf),
        deviceIdKey: deviceIdUpload.key,
        licenseKey: licenseUpload.key,
        customerFio: params.customerFio,
        customerOrganization: params.customerOrganization || null,
        customerEmail: params.customerEmail || null,
        customerPhone: params.customerPhone ? normalizePhone(params.customerPhone) : null,
        region: params.customerRegion || null,
        city: params.customerCity || null,
        vehicleVin: params.vehicleVin || null,
        vehicleModel: params.vehicleModel || null,
      },
    });
    await tx.dealerProfile.update({
      where: { userId: dealer.id },
      data: { licensesUsed: { increment: 1 } },
    });
    await tx.licenseAuditLog.create({
      data: {
        licenseId: created.id,
        actorId: dealer.id,
        action: "CREATED",
        diff: { signature: generated.meta.signature, size: generated.meta.size },
      },
    });
    return created;
  });

  const downloadUrl = await getDownloadUrl(licenseUpload.key, 300);

  return NextResponse.json({
    licenseId: license.id,
    number: license.number,
    downloadUrl,
  });
}

function safeJson(s: string): Record<string, boolean> {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return v as Record<string, boolean>;
  } catch {}
  return {};
}

async function uniqueLicenseNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = generateLicenseNumber();
    const exists = await db.license.findUnique({ where: { number: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Не удалось сгенерировать уникальный номер лицензии");
}

function extractHexId(buf: Buffer): string {
  const head = buf.subarray(0, Math.min(64, buf.length));
  return head.toString("hex").slice(0, 32);
}
