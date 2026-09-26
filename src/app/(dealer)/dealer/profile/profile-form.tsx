"use client";

import * as React from "react";
import { Save, Phone, Building2, MapPin, Lock, Eye, Upload, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tag } from "@/components/ui/tag";
import { Avatar } from "@/components/ui/avatar";
import { formatRuDate } from "@/lib/dates";
import type { SitePublication } from "@/lib/site-sync-labels";

type ProfileInitial = {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  organization: string;
  inn: string;
  city: string;
  region: string;
  country: string;
  address: string;
  siteComment: string;
  phoneVisibleOnSite: boolean;
  notifyByEmail: boolean;
  notifyByTelegram: boolean;
  telegramChatId: string;
};

type PublicationState = {
  status: SitePublication;
  at: string | null;
  note: string | null;
  /** Сохранённое значение тоггла — от него зависит, что будет после «Сохранить». */
  consent: boolean;
};

export function ProfileForm({
  initial,
  publication: initialPublication,
  email,
  avatarUrl: initialAvatarUrl,
  displayName,
}: {
  initial: ProfileInitial;
  publication: PublicationState;
  email: string;
  avatarUrl: string | null;
  displayName: string;
}) {
  const [data, setData] = React.useState(initial);
  const [publication, setPublication] = React.useState(initialPublication);
  const [requesting, setRequesting] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState(initialAvatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pwd, setPwd] = React.useState({ current: "", next: "", confirm: "" });
  const [pwdErr, setPwdErr] = React.useState<{ next?: string; confirm?: string }>({});
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
    if (data.phoneVisibleOnSite !== publication.consent) {
      setPublication({
        status: data.phoneVisibleOnSite ? "PENDING" : "NONE",
        at: new Date().toISOString(),
        note: null,
        consent: data.phoneVisibleOnSite,
      });
      toast.success(
        data.phoneVisibleOnSite
          ? "Профиль обновлён, заявка на публикацию отправлена администратору"
          : "Профиль обновлён, телефон снят с сайта",
      );
      return;
    }
    toast.success("Профиль обновлён");
  }

  async function requestAgain() {
    setRequesting(true);
    const res = await fetch("/api/profile/site-publication", { method: "POST" });
    setRequesting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось отправить заявку");
      return;
    }
    setPublication({ ...publication, status: "PENDING", at: new Date().toISOString(), note: null });
    toast.success("Заявка отправлена администратору");
  }

  async function savePassword() {
    const next: { next?: string; confirm?: string } = {};
    if (pwd.next.length < 8) next.next = "Минимум 8 символов";
    if (pwd.next !== pwd.confirm) next.confirm = "Пароли не совпадают";
    setPwdErr(next);
    if (Object.keys(next).length > 0) return;
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
    // Смена пароля отзывает сессии на всех устройствах, включая эту.
    setPwd({ current: "", next: "", confirm: "" });
    await signOut({ redirect: false });
    window.location.assign("/login?notice=password");
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
            <Input label="Страна" placeholder="Россия" value={data.country} onChange={(e) => setData({ ...data, country: e.target.value })} />
            <Input label="Регион" icon={<MapPin className="h-4 w-4" />} value={data.region} onChange={(e) => setData({ ...data, region: e.target.value })} />
            <Input label="Город" value={data.city} onChange={(e) => setData({ ...data, city: e.target.value })} />
            <div className="sm:col-span-2">
              <Input label="Адрес" value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })} />
            </div>
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
            <Input label="Новый пароль" type="password" value={pwd.next} error={pwdErr.next} onChange={(e) => { setPwd({ ...pwd, next: e.target.value }); if (pwdErr.next) setPwdErr((p) => ({ ...p, next: undefined })); }} />
            <Input label="Повторите" type="password" value={pwd.confirm} error={pwdErr.confirm} onChange={(e) => { setPwd({ ...pwd, confirm: e.target.value }); if (pwdErr.confirm) setPwdErr((p) => ({ ...p, confirm: undefined })); }} />
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
                  variant="ghostDanger"
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
          <div className="font-display text-lg  tracking-tight mb-4">Публикация на сайте</div>
          <Toggle
            checked={data.phoneVisibleOnSite}
            onChange={(v) => setData({ ...data, phoneVisibleOnSite: v })}
            label={
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Показывать телефон на сайте
              </span>
            }
            description="После одобрения администратором телефон, город и подпись появятся в «Дилерской сети» на mmbrussia.ru/contacts."
          />
          <PublicationStatus
            publication={publication}
            toggle={data.phoneVisibleOnSite}
            requesting={requesting}
            onRequestAgain={() => void requestAgain()}
          />
          {data.phoneVisibleOnSite ? (
            <div className="mt-4">
              <Input
                label="Подпись на сайте"
                placeholder="Например: имя или район"
                maxLength={200}
                value={data.siteComment}
                onChange={(e) => setData({ ...data, siteComment: e.target.value })}
                hint="Необязательно. Показывается рядом с телефоном."
              />
            </div>
          ) : null}
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

function PublicationStatus({
  publication,
  toggle,
  requesting,
  onRequestAgain,
}: {
  publication: PublicationState;
  toggle: boolean;
  requesting: boolean;
  onRequestAgain: () => void;
}) {
  const box = "mt-4 rounded-panel border border-hairline p-3 text-xs text-ink-muted space-y-2";

  if (toggle !== publication.consent) {
    return (
      <div className={box}>
        {toggle
          ? "Сохраните профиль — заявка на публикацию уйдёт администратору."
          : publication.status === "APPROVED"
            ? "Сохраните профиль — телефон сразу исчезнет с сайта."
            : "Сохраните профиль, чтобы отозвать заявку."}
      </div>
    );
  }
  if (!publication.consent) return null;

  if (publication.status === "PENDING") {
    return (
      <div className={box}>
        <Tag tone="warning">На рассмотрении</Tag>
        <div>
          Заявка отправлена{publication.at ? ` ${formatRuDate(publication.at)}` : ""}. Телефон появится
          на сайте после одобрения администратором.
        </div>
      </div>
    );
  }
  if (publication.status === "APPROVED") {
    return (
      <div className={box}>
        <Tag tone="success">Опубликован</Tag>
        <div>
          Телефон показывается в «Дилерской сети» на{" "}
          <a
            href="https://mmbrussia.ru/contacts"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            mmbrussia.ru/contacts
          </a>
          . Выключите переключатель и сохраните, чтобы убрать его.
        </div>
      </div>
    );
  }
  return (
    <div className={box}>
      <Tag tone="danger">Не опубликован</Tag>
      <div>
        {publication.status === "REJECTED"
          ? "Администратор отклонил заявку или снял телефон с сайта."
          : "Заявка ещё не отправлена."}
        {publication.note ? (
          <>
            {" "}Причина: <span className="text-ink">{publication.note}</span>
          </>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={requesting}
        icon={<Send className="h-4 w-4" />}
        onClick={onRequestAgain}
      >
        {publication.status === "REJECTED" ? "Подать заявку повторно" : "Подать заявку"}
      </Button>
    </div>
  );
}
