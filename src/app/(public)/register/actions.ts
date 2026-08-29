"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

async function lookupSignupGeo(): Promise<{ ip: string | null; country: string | null; city: string | null }> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0]?.trim() : h.get("x-real-ip")?.trim() ?? null;
    const base = process.env.GEO_LOOKUP_URL ?? "http://ip-api.com/json";
    const res = await fetch(`${base}/${ip ?? ""}?fields=status,country,city,query&lang=ru`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { status?: string; country?: string; city?: string; query?: string };
    if (data.status !== "success") return { ip: ip ?? null, country: null, city: null };
    return { ip: data.query ?? ip ?? null, country: data.country ?? null, city: data.city ?? null };
  } catch {
    return { ip: null, country: null, city: null };
  }
}

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
  const geo = await lookupSignupGeo();

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
          signupIp: geo.ip,
          signupCountry: geo.country,
          signupCity: geo.city,
        },
      },
    },
  });

  return { ok: true as const };
}
