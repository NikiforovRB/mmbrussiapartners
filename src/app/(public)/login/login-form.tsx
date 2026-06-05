"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dealer";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Заполните email и пароль");
      return;
    }
    setLoading(true);
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      const code = res?.error;
      if (code === "ACCOUNT_SUSPENDED") {
        toast.error("Аккаунт заблокирован администратором");
      } else if (code === "ACCOUNT_REJECTED") {
        toast.error("Заявка отклонена. Свяжитесь с администратором");
      } else {
        toast.error("Неверный email или пароль");
      }
      return;
    }
    toast.success("Добро пожаловать");
    router.push(callbackUrl || "/dealer");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="example@mmbrussia.ru"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        icon={<Mail className="h-4 w-4" />}
        required
      />
      <Input
        label="Пароль"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        icon={<Lock className="h-4 w-4" />}
        required
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
