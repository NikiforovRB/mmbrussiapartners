"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Экран «Заявка на рассмотрении»: исправить опечатку в email до одобрения. */
export function PendingEmailFix({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(email);
  const [error, setError] = React.useState<string | undefined>();
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Некорректный email");
      return;
    }
    setSaving(true);
    setError(undefined);
    const res = await fetch("/api/profile/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: next }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);
    if (!res?.ok) {
      setError(data?.error ?? "Не удалось сохранить email");
      return;
    }
    toast.success("Email исправлен. Входите с новым адресом.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-accent hover:underline"
      >
        Ошиблись в адресе? Исправить email
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 text-left" noValidate>
      <Input
        label="Email для входа"
        type="email"
        autoComplete="email"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(undefined);
        }}
        icon={<Mail className="h-4 w-4" />}
        error={error}
        hint="На этот адрес придёт уведомление об одобрении заявки."
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Отмена
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
