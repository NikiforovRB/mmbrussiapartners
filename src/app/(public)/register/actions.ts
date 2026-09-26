"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sealPassword } from "@/lib/password-vault";
import { normalizePhone } from "@/lib/utils";
import { notifyAdmins } from "@/lib/app-notifications";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { lookupIpGeo } from "@/lib/geo-ip";
import { linkLegacyDealer } from "@/lib/legacy-dealers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Минимум 8 символов"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional().or(z.literal("")),
  phone: z.string().min(6),
  organization: z.string().optional().or(z.literal("")),
  region: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
});

export async function registerDealerAction(formData: FormData) {
  // Анти-спам: не более 5 регистраций с одного IP в час.
  const ip = clientIp(await headers());
  if (!(await rateLimit(`register:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 })).ok) {
    return { ok: false as const, error: "Слишком много попыток регистрации. Попробуйте позже." };
  }

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Неверные данные" };
  }
  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    return { ok: false as const, error: "Пользователь с таким email уже существует" };
  }

  const dealerRole = await db.role.findUnique({ where: { name: "Представитель" } });
  if (!dealerRole) {
    return { ok: false as const, error: "Роль 'Представитель' не настроена. Обратитесь к администратору." };
  }

  const passwordHash = await hashPassword(data.password);
  // Гео-сервис — не повод задерживать регистрацию.
  const geo = await lookupIpGeo(ip, 3_000);

  const created = await db.user.create({
    data: {
      email,
      passwordHash,
      status: "PENDING",
      isSuperAdmin: false,
      roleId: dealerRole.id,
      dealerProfile: {
        create: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          middleName: data.middleName?.trim() || null,
          phone: normalizePhone(data.phone),
          organization: data.organization?.trim() || null,
          city: data.city?.trim() || null,
          region: data.region?.trim() || null,
          licenseLimit: 0,
          signupIp: geo.ip,
          signupCountry: geo.country,
          signupCity: geo.city,
        },
      },
    },
  });
  const sealed = sealPassword(created.id, data.password);
  if (sealed) {
    await db.user.update({ where: { id: created.id }, data: { passwordEncrypted: sealed } });
  }
  if (geo.ip) {
    await db.userIp
      .create({
        data: {
          userId: created.id,
          ip: geo.ip,
          country: geo.country,
          countryCode: geo.countryCode,
          city: geo.city,
        },
      })
      .catch((err) => console.error("[register] не удалось записать IP", err));
  }
  const legacy = await linkLegacyDealer(created.id).catch((err) => {
    console.error("[register] сверка со старым ЛК не удалась", err);
    return false;
  });

  await notifyAdmins(["dealers.approve"], {
    type: "DEALER_REGISTERED",
    title: "Новая заявка на регистрацию",
    body:
      `${data.lastName.trim()} ${data.firstName.trim()} · ${email}` +
      (legacy ? " · работал в старом ЛК DriveMods" : ""),
    link: `/admin/dealers/${created.id}`,
  });

  return { ok: true as const };
}
