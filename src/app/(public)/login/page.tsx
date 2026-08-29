import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getCabinetPath } from "@/lib/cabinet-path";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect(getCabinetPath(session.user));
  }
  return (
    <div className="grid lg:grid-cols-2 gap-10 pt-10 lg:pt-16 items-center">
      <div className="hidden lg:block">
        <div className="rounded-panel surface-dark p-10 min-h-[520px] relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
          <div className="relative">
            <div className="text-xs tracking-widest uppercase text-white/60">MMB · Личный кабинет дилера</div>
            <h1 className="mt-3 font-display text-4xl  tracking-tightest leading-tight">
              Лицензии,
              <br /> аналитика
              <br /> и&nbsp;дилеры
            </h1>
            <p className="mt-6 text-white/70 max-w-sm">
              Удобный личный кабинет для генерации и управления лицензиями. Оперативная техподдержка и помощь на всех этапах.
            </p>
          </div>
        </div>
      </div>
      <div>
        <div className="rounded-panel bg-white p-8 md:p-10 max-w-md mx-auto">
          <h2 className="font-display text-2xl  tracking-tight">Вход в кабинет</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Введите email и пароль, чтобы продолжить
          </p>
          <div className="mt-7">
            <Suspense fallback={<div className="h-40 skeleton rounded-panel" />}>
              <LoginForm />
            </Suspense>
          </div>
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href="/forgot" className="text-ink-muted hover:text-ink">
              Забыли пароль?
            </Link>
            <Link href="/register" className="text-accent ">
              Регистрация
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
