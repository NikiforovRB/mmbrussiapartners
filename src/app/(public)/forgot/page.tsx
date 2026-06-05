import Link from "next/link";

export default function ForgotPage() {
  return (
    <div className="pt-10 lg:pt-16">
      <div className="rounded-panel bg-white p-8 md:p-10 max-w-md mx-auto">
        <h2 className="font-display text-2xl  tracking-tight">Восстановление пароля</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Свяжитесь с администратором по почте{" "}
          <a href="mailto:marat@mmbrussia.ru" className="text-accent">
            marat@mmbrussia.ru
          </a>{" "}
          или по телефону{" "}
          <a href="tel:+79250374666" className="text-accent">
            8 (925) 037-46-66
          </a>{" "}
          — он сбросит пароль и пришлёт инструкцию.
        </p>
        <div className="mt-6 text-sm">
          <Link href="/login" className="text-accent ">
            ← Вернуться к входу
          </Link>
        </div>
      </div>
    </div>
  );
}
