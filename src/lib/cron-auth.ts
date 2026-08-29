import "server-only";

import { timingSafeEqual } from "node:crypto";
import { ApiError, forbidden } from "./api";

/**
 * Пускает только планировщик Vercel.
 *
 * Отсутствие CRON_SECRET — это не «проверку можно пропустить», а незавершённая
 * настройка: иначе эндпоинты массового изменения статусов и рассылки писем
 * оказались бы открыты всему интернету.
 */
export function assertCronRequest(req: Request): void {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Планировщик не настроен: задайте переменную окружения CRON_SECRET",
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw forbidden("Недействительный ключ планировщика");
  }
}
