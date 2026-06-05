import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MMB RUSSIA — Кабинет представителей",
    template: "%s · MMB RUSSIA",
  },
  description:
    "Личный кабинет представителей MMB RUSSIA: генерация лицензий, аналитика, отчёты, управление дилерами.",
  applicationName: "MMB RUSSIA Partners",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "MMB RUSSIA — Кабинет представителей",
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
    <html lang="ru">
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(14px)",
              borderRadius: 12,
              border: "none",
              boxShadow: "none",
              color: "#0b1020",
              fontFamily: '"Gilroy", system-ui, sans-serif',
            },
          }}
        />
      </body>
    </html>
  );
}
