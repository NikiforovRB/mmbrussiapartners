"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Phone,
  User as UserIcon,
  Building2,
  MapPin,
  ArrowRight,
  CheckCircle2,
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

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Пароль должен содержать минимум 8 символов");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!agreed) {
      toast.error("Необходимо согласие на обработку персональных данных");
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
      toast.error(res.error ?? "Не удалось зарегистрироваться");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <GeoNotice />
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
        type="text"
        required
        placeholder="Минимум 8 символов"
        icon={<Lock className="h-4 w-4" />}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="space-y-1.5">
        <Input
          label="Введите пароль повторно *"
          name="passwordConfirm"
          type="text"
          required
          placeholder="Повторите пароль"
          icon={<Lock className="h-4 w-4" />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        onChange={setAgreed}
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

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={loading}
        disabled={!agreed}
        title={agreed ? undefined : "Подтвердите согласие на обработку персональных данных"}
        iconRight={<ArrowRight className="h-4 w-4" />}
      >
        Подать заявку
      </Button>
    </form>
  );
}
