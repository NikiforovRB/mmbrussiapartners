import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="grid lg:grid-cols-2 gap-10 pt-10 lg:pt-16 items-center">
      <div className="hidden lg:block">
        <div className="rounded-panel bg-card-light p-10 min-h-[520px] relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.45), transparent)" }} />
          <div className="relative">
            <div className="text-xs tracking-widest uppercase text-ink-muted">Стать дилером</div>
            <h1 className="mt-3 font-display text-4xl  tracking-tightest leading-tight">
              Присоединяйтесь
              <br /> к сети представителей
              <br /> <span className="gradient-text">MMB RUSSIA</span>
            </h1>
            <p className="mt-6 text-ink-muted max-w-sm">
              Заполните форму, администратор рассмотрит заявку и одобрит её. После одобрения вы получите лимит лицензий и доступ к кабинету.
            </p>
          </div>
        </div>
      </div>
      <div>
        <div className="rounded-panel bg-white p-8 md:p-10 max-w-xl mx-auto">
          <h2 className="font-display text-2xl  tracking-tight">Регистрация представителя</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Все поля, помеченные звёздочкой, обязательны
          </p>
          <div className="mt-7">
            <RegisterForm />
          </div>
          <div className="mt-6 text-sm text-ink-muted">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-accent ">
              Войти
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
