"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** Длина маски не зависит от пароля — по точкам его длину не угадать. */
const MASK = "••••••••••";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(): string {
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

export function DealerPasswordCard({
  dealerId,
  known: initialKnown,
  configured,
}: {
  dealerId: string;
  /** В базе есть зашифрованная копия пароля. */
  known: boolean;
  /** На сервере задан ключ шифрования паролей. */
  configured: boolean;
}) {
  const [known, setKnown] = React.useState(initialKnown);
  // Пароль не приходит со страницей: его отдаёт API по нажатию на глазик.
  const [password, setPassword] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const canReveal = known && configured;

  async function toggle() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (password === null) {
      setLoading(true);
      const res = await fetch(`/api/dealers/${dealerId}/password`, { cache: "no-store" });
      setLoading(false);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Не удалось получить пароль");
        return;
      }
      if (!j.password) {
        setKnown(false);
        toast.error("Пароль недоступен — задайте новый");
        return;
      }
      setPassword(j.password as string);
    }
    setRevealed(true);
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  function openChange() {
    setNext("");
    setConfirm("");
    setChangeOpen(true);
  }

  function fillGenerated() {
    const generated = generatePassword();
    setNext(generated);
    setConfirm(generated);
  }

  async function save() {
    if (next.length < 8) {
      toast.error("Пароль — минимум 8 символов");
      return;
    }
    if (next !== confirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/dealers/${dealerId}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: next }),
    });
    setSaving(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Не удалось сменить пароль");
      return;
    }
    if (j.stored) {
      setKnown(true);
      setPassword(next);
    }
    setRevealed(false);
    setChangeOpen(false);
    toast.success("Пароль изменён. Представитель выйдет из кабинета на всех устройствах.");
  }

  const shown = revealed && password !== null;

  return (
    <Card>
      <div className="font-display text-lg tracking-tight mb-4">Пароль от кабинета</div>
      <div className="space-y-1.5">
        <span className="block text-[12.5px] text-ink-muted">Пароль представителя</span>
        <div className="field-control flex h-12 items-center gap-1 rounded-panel border border-hairline bg-white pl-4 pr-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14.5px]",
              shown ? "font-mono" : canReveal ? "tracking-widest text-ink-muted" : "text-ink-subtle",
            )}
          >
            {shown ? password : canReveal ? MASK : "недоступен"}
          </span>
          {shown ? (
            <button
              type="button"
              onClick={copy}
              aria-label="Скопировать пароль"
              title="Скопировать пароль"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-btn text-ink-subtle transition-colors hover:text-ink"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            disabled={!canReveal || loading}
            aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
            aria-pressed={shown}
            title={shown ? "Скрыть пароль" : "Показать пароль"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-btn text-ink-subtle transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : shown ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {!configured ? (
          <p className="text-xs text-danger">
            Хранение паролей не настроено на сервере (DEALER_PASSWORD_KEY): пароль можно только сменить.
          </p>
        ) : !known ? (
          <p className="text-xs text-ink-subtle">
            Пароль задан до появления этой функции и хранится только в виде хэша. Он появится здесь после следующего
            входа представителя в кабинет — или задайте новый.
          </p>
        ) : (
          <p className="text-xs text-ink-subtle">Каждый просмотр пароля записывается в логи.</p>
        )}
      </div>
      <div className="mt-4">
        <Button size="sm" variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={openChange}>
          Сменить пароль
        </Button>
      </div>

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Новый пароль представителя"
        description="Представитель выйдет из кабинета на всех устройствах и войдёт уже с новым паролем."
      >
        <div className="space-y-3">
          <Input
            label="Новый пароль"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint="Минимум 8 символов"
          />
          <Input
            label="Повторите пароль"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirm && confirm !== next ? "Пароли не совпадают" : undefined}
          />
          <button
            type="button"
            onClick={fillGenerated}
            className="inline-flex items-center gap-1.5 text-sm text-accent transition-opacity hover:opacity-80"
          >
            <Wand2 className="h-4 w-4" /> Сгенерировать надёжный пароль
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setChangeOpen(false)}>
            Отмена
          </Button>
          <Button loading={saving} icon={<KeyRound className="h-4 w-4" />} onClick={save}>
            Сохранить пароль
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
