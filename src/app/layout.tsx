import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MMB RUSSIA — Кабинет дилеров",
    template: "%s · MMB RUSSIA",
  },
  description:
    "Личный кабинет дилеров MMB RUSSIA: генерация лицензий, аналитика, отчёты, управление дилерами.",
  applicationName: "MMB RUSSIA Partners",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "169x169" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "MMB RUSSIA — Кабинет дилеров",
    description: "Лицензии, отчёты и аналитика для дилеров MMB RUSSIA.",
    type: "website",
    locale: "ru_RU",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Класс dark ставит скрипт до гидрации — React не должен с ним спорить.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            // Иконки sonner рисуются currentColor — белый текст делает белой и галочку.
            style: {
              background: "#2a9fff",
              borderRadius: 12,
              border: "none",
              boxShadow: "0 12px 32px -12px rgba(10,120,216,0.55)",
              color: "#ffffff",
              fontFamily: '"Gilroy", system-ui, sans-serif',
            },
          }}
        />
      </body>
    </html>
  );
}
