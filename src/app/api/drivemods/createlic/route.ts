import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { uploadObject, getDownloadUrl } from "@/lib/s3";
import { createLic, DriveModsError, isDriveModsConfigured } from "@/lib/drivemods";
import { generateLicenseNumber, normalizePhone, fioFromParts } from "@/lib/utils";
import { isLicenseType } from "@/lib/license-options";
import { defaultLicensePrice } from "@/lib/payments/provider";
import { createPayment } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  deviceBase64: z.string().min(1),
  deviceId: z.string().optional().or(z.literal("")),
  type: z.string().min(1),
  product: z.string().min(1),
  bundle: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  versionSoftware: z.string().optional().or(z.literal("")),
  versionCustom: z.string().optional().or(z.literal("")),
  dealerComment: z.string().optional().or(z.literal("")),
  customerFio: z.string().optional().or(z.literal("")),
  customerOrganization: z.string().optional().or(z.literal("")),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional().or(z.literal("")),
  customerRegion: z.string().optional().or(z.literal("")),
  customerCity: z.string().optional().or(z.literal("")),
  issuedWithoutPayment: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (session.user.status !== "APPROVED") {
    return NextResponse.json({ error: "Аккаунт не одобрен" }, { status: 403 });
  }
  if (!isDriveModsConfigured()) {
    return NextResponse.json(
      { error: "Интеграция DRIVEMODS не настроена. Обратитесь к администратору." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Неверные параметры" }, { status: 400 });
  }
  const p = parsed.data;
  if (!isLicenseType(p.type)) {
    return NextResponse.json({ error: "Неверный тип лицензии" }, { status: 400 });
  }

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

  let deviceBuffer: Buffer;
  try {
    deviceBuffer = Buffer.from(p.deviceBase64, "base64");
  } catch {
    return NextResponse.json({ error: "Некорректный файл device_id.bin" }, { status: 400 });
  }

  const dealerName =
    fioFromParts({
      firstName: dealer.dealerProfile.firstName,
      lastName: dealer.dealerProfile.lastName,
      middleName: dealer.dealerProfile.middleName,
    }) || dealer.email;
  const dealerComment = (p.dealerComment || dealerName).trim();

  const isAdminActor =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "dealers.view", session.user.isSuperAdmin);
  const issuedWithoutPayment = isAdminActor && p.issuedWithoutPayment === true;

  const licenseNumber = await uniqueLicenseNumber();

  const deviceIdUpload = await uploadObject(
    "deviceIds",
    `${licenseNumber}-device-id.bin`,
    deviceBuffer,
    "application/octet-stream",
  );

  let generated;
  try {
    generated = await createLic({
      deviceIdBase64: p.deviceBase64,
      product: p.product,
      bundle: p.bundle || null,
      region: p.region || null,
      versionSoftware: p.versionSoftware || "",
      versionCustom: p.versionCustom || "",
      dealerComment,
      deviceId: p.deviceId || "",
    });
  } catch (err) {
    const status = err instanceof DriveModsError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Ошибка генерации лицензии";
    return NextResponse.json({ error: message }, { status });
  }

  const licenseBuffer = Buffer.from(generated.lic_file, "base64");
  const licenseUpload = await uploadObject(
    "licenses",
    generated.lic_filename || `${licenseNumber}-device-license.bin`,
    licenseBuffer,
    "application/octet-stream",
  );

  const termStart = new Date();
  const termEnd = new Date(termStart);
  termEnd.setFullYear(termEnd.getFullYear() + 100); // лицензия бессрочная

  const price = issuedWithoutPayment ? 0 : defaultLicensePrice();

  const license = await db.$transaction(async (tx) => {
    const created = await tx.license.create({
      data: {
        number: licenseNumber,
        dealerId: dealer.id,
        type: p.type,
        status: "ACTIVE",
        price: price || null,
        features: {},
        termStart,
        termEnd,
        deviceId: generated.device_id || p.deviceId || "",
        deviceIdKey: deviceIdUpload.key,
        licenseKey: licenseUpload.key,
        product: p.product,
        bundle: p.bundle || null,
        productRegion: p.region || null,
        versionSoftware: p.versionSoftware || null,
        versionCustom: p.versionCustom || null,
        dealerComment,
        issuedWithoutPayment,
        customerFio: (p.customerFio || dealerComment).trim(),
        customerOrganization: p.customerOrganization || null,
        customerEmail: p.customerEmail || null,
        customerPhone: p.customerPhone ? normalizePhone(p.customerPhone) : null,
        region: p.customerRegion || null,
        city: p.customerCity || null,
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
        reason: `${p.type}: ${p.product}`,
      },
    });
    return created;
  });

  const downloadUrl = await getDownloadUrl(licenseUpload.key, 300);

  // Счёт выставляем после генерации: файл уже у дилера, а оплата и чек
  // идут своим циклом. Сбой биллинга не должен терять выданную лицензию.
  let payment: { id: string; amount: number; payUrl: string | null } | null = null;
  if (price > 0) {
    try {
      const created = await createPayment({
        dealerId: dealer.id,
        licenseId: license.id,
        amount: price,
        description: `Лицензия ${license.number} · ${p.product}`,
        email: dealer.email,
        phone: dealer.dealerProfile.phone,
      });
      payment = { id: created.id, amount: Number(created.amount), payUrl: created.payUrl };
    } catch {
      payment = null;
    }
  }

  return NextResponse.json({
    licenseId: license.id,
    number: license.number,
    filename: generated.lic_filename,
    downloadUrl,
    payment,
  });
}

async function uniqueLicenseNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = generateLicenseNumber();
    const exists = await db.license.findUnique({ where: { number: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Не удалось сгенерировать уникальный номер лицензии");
}
