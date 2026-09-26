"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Phone,
  User as   UserIcon,
  Building2,
  MapPin,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { GeoNotice } from "./geo-notice";
import { registerDealerAction } from "./actions";

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | undefined>();
  const [agreeError, setAgreeError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setPasswordError(undefined);
    setAgreeError(null);
    if (password.length < 8) {
      setPasswordError("Пароль должен содержать минимум 8 символов");
      return;
    }
    if (!passwordsMatch) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    if (!agreed) {
      setAgreeError("Необходимо согласие на обработку персональных данных");
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await registerDealerAction(fd);
    setLoading(false);
    if (res.ok) {
      toast.success("Заявка отправлена. Ожидайте одобрения администратора.");
      router.push("/login?registered=1");
    } else {
      setFormError(res.error ?? "Не удалось зарегистрироваться");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <GeoNotice />
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-btn border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 gap-3">
        <Input
          label="Фамилия *"
          name="lastName"
          required
          placeholder="Иванов"
          icon={<UserIcon className="h-4 w-4" />}
        />
        <Input label="Имя *" name="firstName" required placeholder="Иван" />
      </div>
      <Input label="Отчество" name="middleName" placeholder="Иванович" />
      <div className="grid md:grid-cols-2 gap-3">
        <Input
          label="Email *"
          name="email"
          type="email"
          required
          placeholder="example@mmbrussia.ru"
          icon={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Телефон *"
          name="phone"
          required
          placeholder="+7 (___) ___-__-__"
          icon={<Phone className="h-4 w-4" />}
        />
      </div>
      <Input
        label="Организация"
        name="organization"
        placeholder="ИП Иванов / ООО ..."
        icon={<Building2 className="h-4 w-4" />}
      />
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Регион" name="region" placeholder="Москва" icon={<MapPin className="h-4 w-4" />} />
        <Input label="Город" name="city" placeholder="Москва" />
      </div>
      <Input
        label="Пароль *"
        name="password"
        type="password"
        required
        placeholder="Минимум 8 символов"
        icon={<Lock className="h-4 w-4" />}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (passwordError) setPasswordError(undefined);
        }}
        error={passwordError}
      />
      <div className="space-y-1.5">
        <Input
          label="Введите пароль повторно *"
          name="passwordConfirm"
          type="password"
          required
          placeholder="Повторите пароль"
          icon={<Lock className="h-4 w-4" />}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (passwordError) setPasswordError(undefined);
          }}
        />
        {passwordsMatch ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Пароли совпадают
          </p>
        ) : passwordsMismatch ? (
          <p className="text-xs text-danger">Пароли не совпадают</p>
        ) : null}
      </div>

      <Checkbox
        checked={agreed}
        onChange={(v) => {
          setAgreed(v);
          if (agreeError) setAgreeError(null);
        }}
        label={
          <span>
            Я согласен с политикой обработки{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="text-accent underline"
              onClick={(e) => e.stopPropagation()}
            >
              персональных данных
            </Link>
          </span>
        }
      />
      {agreeError ? (
        <p className="text-xs text-danger">{agreeError}</p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={loading}
        disabled={!agreed}
        title={agreed ? undefined : "Подтвердите согласие на обработку персональных данных"}
        iconRight={<ArrowRight className="h-4 w-4" />}
      >
        Подать заявку на партнёрство
      </Button>
    </form>
  );
}
