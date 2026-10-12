import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { conflict, forbidden, parseBody, route } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { linkLegacyDealer } from "@/lib/legacy-dealers";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email").max(254),
});

/**
 * Пока заявка на рассмотрении, дилер сам исправляет опечатку в email: иначе
 * войти с правильным адресом он уже не сможет. После решения по заявке адрес
 * меняет только администратор.
 */
export const PATCH = route(
  async (req: Request) => {
    const session = await requireSession();
    const { email } = await parseBody(req, schema);
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== "PENDING") {
      throw forbidden("Email можно исправить, пока заявка на рассмотрении. Сейчас его меняет администратор.");
    }
    if (email === user.email) return NextResponse.json({ ok: true, email });

    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw conflict("Пользователь с таким email уже существует");
    await db.user.update({ where: { id: user.id }, data: { email } });
    await linkLegacyDealer(user.id).catch((err) => console.error("[profile] сверка со старым ЛК не удалась", err));
    return NextResponse.json({ ok: true, email });
  },
  { rateLimit: { limit: 5, windowMs: 60 * 60_000, name: "pending-email" } },
);
