import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/admin", "/dealer"];

const S3_ORIGINS = "https://s3.twcstorage.ru https://*.twcstorage.ru";
/** Должно покрывать все embedUrl из parseVideoEmbed (src/lib/knowledge.ts). */
const VIDEO_ORIGINS =
  "https://www.youtube.com https://player.vimeo.com https://rutube.ru https://vk.com https://vkvideo.ru";

/**
 * Скрипты разрешены только с nonce этого запроса: Next проставляет его своим
 * скриптам сам, прочитав заголовок Content-Security-Policy из запроса. Поэтому
 * страницы должны рендериться динамически — у статически собранной страницы
 * nonce не будет, и её скрипты заблокируются.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${S3_ORIGINS}`,
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `media-src 'self' ${S3_ORIGINS}`,
    `frame-src ${VIDEO_ORIGINS}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const sessionToken =
      req.cookies.get("authjs.session-token")?.value ??
      req.cookies.get("__Secure-authjs.session-token")?.value;

    if (!sessionToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // API отдаёт JSON и получает свою строгую политику из next.config.mjs.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
