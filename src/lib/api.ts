import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { rateLimit, clientIp } from "./rate-limit";

/**
 * Единый формат ответа об ошибке для всех роутов:
 *
 *   { "error": "Текст для пользователя", "code": "FORBIDDEN" }
 *
 * `error` всегда пригоден для показа в тосте, `code` — машинный признак,
 * по которому клиент может отличить, например, нехватку прав от валидации.
 */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UPSTREAM"
  | "NOT_CONFIGURED"
  | "TOO_MANY"
  | "INTERNAL";

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  UPSTREAM: 502,
  NOT_CONFIGURED: 503,
  TOO_MANY: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
  }
}

export const unauthenticated = () => new ApiError("UNAUTHENTICATED", "Требуется вход в систему");
export const forbidden = (message = "Недостаточно прав") => new ApiError("FORBIDDEN", message);
export const notFound = (message = "Не найдено") => new ApiError("NOT_FOUND", message);
export const badRequest = (message: string) => new ApiError("VALIDATION", message);
export const conflict = (message: string) => new ApiError("CONFLICT", message);
export const tooManyRequests = (message = "Слишком много запросов. Повторите позже.") =>
  new ApiError("TOO_MANY", message);

export function apiError(error: ApiError) {
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
}

/**
 * Оборачивает обработчик роута: доменные ошибки превращает в аккуратный JSON,
 * непредвиденные — логирует на сервере и отдаёт нейтральный текст, чтобы
 * наружу не утекали детали инфраструктуры.
 */
export type RouteOptions = {
  /**
   * Ограничение частоты по IP: не более `limit` запросов за `windowMs`.
   * Ключ строится из имени (или пути), метода и IP клиента.
   */
  rateLimit?: { limit: number; windowMs: number; name?: string };
};

export function route<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
  options?: RouteOptions,
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      if (options?.rateLimit) {
        const ip = clientIp(req.headers);
        const path = new URL(req.url).pathname;
        const key = `${options.rateLimit.name ?? path}:${req.method}:${ip}`;
        const rl = await rateLimit(key, options.rateLimit);
        if (!rl.ok) {
          const res = apiError(tooManyRequests());
          res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
          return res;
        }
      }
      return await handler(req, ...args);
    } catch (err) {
      if (err instanceof ApiError) return apiError(err);
      if (err instanceof ZodError) {
        const first = err.errors[0];
        return apiError(
          new ApiError("VALIDATION", first?.message ?? "Некорректные данные"),
        );
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}`, err);
      return apiError(new ApiError("INTERNAL", "Внутренняя ошибка сервера"));
    }
  };
}

/** Разбирает тело запроса схемой zod, отдавая единообразную ошибку валидации. */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): Promise<T> {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.errors[0]?.message ?? "Некорректные данные");
  }
  return parsed.data;
}
