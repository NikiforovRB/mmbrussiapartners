import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBody, route, unauthenticated } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";

export const runtime = "nodejs";

const schema = z.object({
  firstName: z.string().min(1, "Укажите имя").optional(),
  lastName: z.string().min(1, "Укажите фамилию").optional(),
  middleName: z.string().nullable().optional(),
  phone: z.string().min(6, "Укажите телефон").optional(),
  organization: z.string().nullable().optional(),
  inn: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phoneVisibleOnSite: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  notifyByTelegram: z.boolean().optional(),
  telegramChatId: z.string().nullable().optional(),
});

export const PATCH = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const d = await parseBody(req, schema);

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(d.notifyByEmail !== undefined && { notifyByEmail: d.notifyByEmail }),
      ...(d.notifyByTelegram !== undefined && { notifyByTelegram: d.notifyByTelegram }),
      ...(d.telegramChatId !== undefined && { telegramChatId: d.telegramChatId || null }),
      dealerProfile: {
        update: {
          ...(d.firstName !== undefined && { firstName: d.firstName }),
          ...(d.lastName !== undefined && { lastName: d.lastName }),
          ...(d.middleName !== undefined && { middleName: d.middleName || null }),
          ...(d.phone !== undefined && { phone: normalizePhone(d.phone) }),
          ...(d.organization !== undefined && { organization: d.organization || null }),
          ...(d.inn !== undefined && { inn: d.inn || null }),
          ...(d.city !== undefined && { city: d.city || null }),
          ...(d.region !== undefined && { region: d.region || null }),
          ...(d.address !== undefined && { address: d.address || null }),
          ...(d.phoneVisibleOnSite !== undefined && { phoneVisibleOnSite: d.phoneVisibleOnSite }),
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
});
