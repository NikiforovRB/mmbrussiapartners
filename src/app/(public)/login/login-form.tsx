"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dealer";
  const notice =
    params.get("notice") === "password" ? "Пароль изменён. Войдите с новым паролем." : null;
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Укажите email";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Некорректный email";
    if (!password) next.password = "Укажите пароль";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setLoading(true);
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      const code = res?.error;
      const message =
        code === "ACCOUNT_SUSPENDED"
          ? "Аккаунт заблокирован администратором"
          : code === "ACCOUNT_REJECTED"
            ? "Заявка отклонена. Свяжитесь с администратором"
            : code === "TOO_MANY_ATTEMPTS"
              ? "Слишком много попыток входа. Попробуйте позже"
              : "Неверный email или пароль";
      setFormError(message);
      return;
    }
    toast.success("Добро пожаловать");
    router.push(callbackUrl || "/dealer");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {notice && !formError ? (
        <div
          role="status"
          className="rounded-btn border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm text-ink"
        >
          {notice}
        </div>
      ) : null}
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="example@mmbrussia.ru"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (fieldErrors.email)
            setFieldErrors((p) => ({ ...p, email: undefined }));
          if (formError) setFormError(null);
        }}
        icon={<Mail className="h-4 w-4" />}
        error={fieldErrors.email}
      />
      <Input
        label="Пароль"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (fieldErrors.password)
            setFieldErrors((p) => ({ ...p, password: undefined }));
          if (formError) setFormError(null);
        }}
        icon={<Lock className="h-4 w-4" />}
        error={fieldErrors.password}
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={loading}
        iconRight={<ArrowRight className="h-4 w-4" />}
      >
        Войти
      </Button>
    </form>
  );
}
