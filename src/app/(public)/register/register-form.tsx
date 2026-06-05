"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Phone,
  User as UserIcon,
  Building2,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerDealerAction } from "./actions";

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={loading}
        iconRight={<ArrowRight className="h-4 w-4" />}
      >
        Подать заявку
      </Button>
      <p className="text-xs text-ink-subtle text-center">
        Регистрируясь, вы соглашаетесь с обработкой персональных данных в рамках работы с MMB RUSSIA.
      </p>
    </form>
  );
}
