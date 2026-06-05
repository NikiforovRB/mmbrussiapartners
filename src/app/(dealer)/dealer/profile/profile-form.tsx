"use client";

import * as React from "react";
import { Save, Phone, Building2, MapPin, Lock, Eye, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Avatar } from "@/components/ui/avatar";

type ProfileInitial = {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  organization: string;
  inn: string;
  city: string;
  region: string;
  address: string;
  phoneVisibleOnSite: boolean;
  notifyByEmail: boolean;
  notifyByTelegram: boolean;
  telegramChatId: string;
};

export function ProfileForm({
  initial,
  email,
  avatarUrl: initialAvatarUrl,
  displayName,
}: {
  initial: ProfileInitial;
  email: string;
  avatarUrl: string | null;
  displayName: string;
}) {
  const [data, setData] = React.useState(initial);
  const [avatarUrl, setAvatarUrl] = React.useState(initialAvatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pwd, setPwd] = React.useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = React.useState(false);
  const [savingPwd, setSavingPwd] = React.useState(false);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
    setUploadingAvatar(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось загрузить фото");
      return;
    }
    const j = await res.json();
    setAvatarUrl(j.url ?? null);
    window.dispatchEvent(new Event("avatar-updated"));
    toast.success("Фото профиля обновлено");
  }

  async function removeAvatar() {
    setUploadingAvatar(true);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setUploadingAvatar(false);
    if (!res.ok) {
      toast.error("Не удалось удалить фото");
      return;
    }
    setAvatarUrl(null);
    window.dispatchEvent(new Event("avatar-updated"));
    toast.success("Фото удалено");
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success("Профиль обновлён");
  }

  async function savePassword() {
    if (pwd.next.length < 8) {
      toast.error("Минимум 8 символов");
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSavingPwd(true);
    const res = await fetch("/api/profile/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: pwd.current, next: pwd.next }),
    });
    setSavingPwd(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка смены пароля");
      return;
    }
    toast.success("Пароль обновлён");
    setPwd({ current: "", next: "", confirm: "" });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Основные данные</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Email" value={email} disabled />
            <Input label="Телефон" icon={<Phone className="h-4 w-4" />} value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} />
            <Input label="Фамилия" value={data.lastName} onChange={(e) => setData({ ...data, lastName: e.target.value })} />
            <Input label="Имя" value={data.firstName} onChange={(e) => setData({ ...data, firstName: e.target.value })} />
            <Input label="Отчество" value={data.middleName} onChange={(e) => setData({ ...data, middleName: e.target.value })} />
            <Input label="Организация" icon={<Building2 className="h-4 w-4" />} value={data.organization} onChange={(e) => setData({ ...data, organization: e.target.value })} />
            <Input label="ИНН" value={data.inn} onChange={(e) => setData({ ...data, inn: e.target.value })} />
            <Input label="Регион" icon={<MapPin className="h-4 w-4" />} value={data.region} onChange={(e) => setData({ ...data, region: e.target.value })} />
            <Input label="Город" value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })} />
            <Input label="Адрес" value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
              Сохранить
            </Button>
          </div>
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Смена пароля</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Input label="Текущий пароль" type="password" icon={<Lock className="h-4 w-4" />} value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
            <Input label="Новый пароль" type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
            <Input label="Повторите" type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          </div>
          <div className="mt-5 flex justify-end">
            <Button loading={savingPwd} onClick={savePassword} icon={<Lock className="h-4 w-4" />}>
              Обновить пароль
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Фото профиля</div>
          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar name={displayName} src={avatarUrl} size={96} />
            <p className="text-sm text-ink-muted max-w-xs">
              Загрузите фото — оно появится в шапке кабинета в правом верхнем углу.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={uploadingAvatar}
                icon={<Upload className="h-4 w-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Загрузить фото
              </Button>
              {avatarUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={uploadingAvatar}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void removeAvatar()}
                >
                  Удалить
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Публичный контакт</div>
          <Toggle
            checked={data.phoneVisibleOnSite}
            onChange={(v) => setData({ ...data, phoneVisibleOnSite: v })}
            label={
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Показывать телефон на сайте
              </span>
            }
            description="После сохранения и одобрения администратором ваш телефон появится в списке представителей на mmbrussia.ru."
          />
          <div className="mt-5 flex justify-end">
            <Button loading={saving} onClick={save} variant="secondary" icon={<Save className="h-4 w-4" />}>
              Сохранить
            </Button>
          </div>
        </Card>
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Уведомления</div>
          <div className="space-y-4">
            <Toggle
              checked={data.notifyByEmail}
              onChange={(v) => setData({ ...data, notifyByEmail: v })}
              label="Email-уведомления"
              description="Об одобрениях, аннулированиях и важных событиях"
            />
            <Toggle
              checked={data.notifyByTelegram}
              onChange={(v) => setData({ ...data, notifyByTelegram: v })}
              label="Telegram-уведомления"
              description="Подключим бот, как только он будет настроен"
            />
            {data.notifyByTelegram ? (
              <Input
                label="Telegram chat_id"
                placeholder="например 123456789"
                value={data.telegramChatId}
                onChange={(e) => setData({ ...data, telegramChatId: e.target.value })}
                hint="Получите chat_id у админ-бота, мы добавим инструкцию позже"
              />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
