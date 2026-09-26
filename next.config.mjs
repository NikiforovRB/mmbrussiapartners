/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "s3.twcstorage.ru" },
      { protocol: "https", hostname: "*.twcstorage.ru" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs", "sanitize-html"],
  // CSP для страниц выставляет src/middleware.ts (там нужен nonce на каждый запрос).
  async headers() {
    const production = process.env.NODE_ENV === "production";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=(), browsing-topics=()",
          },
          ...(production
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
