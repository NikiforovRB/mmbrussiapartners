"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

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

  await db.user.create({
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
        },
      },
    },
  });

  return { ok: true as const };
}
