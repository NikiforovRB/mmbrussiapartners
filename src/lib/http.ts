/** Таймаут исходящего запроса, если вызывающий не задал свой. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

/**
 * fetch к внешнему сервису с обязательным таймаутом: зависший апстрим иначе
 * держит запрос (и воркер Node) до таймаута nginx. По истечении времени
 * бросает DOMException с name === "TimeoutError".
 */
export function fetchWithTimeout(
  input: string | URL,
  { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...init }: FetchWithTimeoutInit = {},
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(input, {
    cache: "no-store",
    ...init,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}
