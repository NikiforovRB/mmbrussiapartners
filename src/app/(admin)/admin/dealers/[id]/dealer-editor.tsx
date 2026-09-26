"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Save,
  Ban,
  ShieldOff,
  ShieldCheck,
  KeyRound,
  Camera,
  Loader2,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Toggle } from "@/components/ui/toggle";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { fioFromParts } from "@/lib/utils";
import { formatRuDate, formatRuDateTime } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import { DeleteDealerButton } from "../delete-dealer-button";

type Dealer = {
  id: string;
  email: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  createdAt: string;
  dealerProfile: {
    firstName: string;
    lastName: string;
    middleName: string | null;
    organization: string | null;
    inn: string | null;
    phone: string;
    city: string | null;
    region: string | null;
    country: string | null;
    address: string | null;
    siteComment: string | null;
    licenseLimit: number;
    licensesUsed: number;
    driveModsAccess: boolean;
    driveModsRequestedAt: string | null;
    legacyDealer: boolean;
  } | null;
  role: { name: string };
};

/** Сводка по представителю из старого ЛК DriveMods, если он там найден. */
export type LegacySummary = {
  id: string;
  name: string;
  city: string | null;
  source: string;
  licenses: number;
  amountTotal: number;
  firstLicenseAt: string | null;
  lastLicenseAt: string | null;
};

export function DealerEditor({
  dealer,
  avatarUrl,
  deletable = false,
  sitePublication,
  passwordCard,
  legacy = null,
}: {
  dealer: Dealer;
  avatarUrl?: string | null;
  deletable?: boolean;
  legacy?: LegacySummary | null;
  /** Карточка модерации публикации на сайте — рендерится страницей по данным из БД. */
  sitePublication?: React.ReactNode;
  /** Пароль от кабинета: только у администратора с правом dealers.passwords. */
  passwordCard?: React.ReactNode;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canApprove = can("dealers.approve");
  const canEdit = can("dealers.edit");
  const canSetLimit = can("dealers.setLimit") || canEdit;
  const canManageStatus = canApprove || canEdit || can("dealers.suspend");
  const canSetLegacy = canEdit || can("pricing.manage");
  const [data, setData] = React.useState(dealer);
  // Статус меняют и другие вкладки/администраторы: свежий ответ сервера
  // после router.refresh() должен перекрывать локальное значение.
  React.useEffect(() => {
    setData((d) => (d.status === dealer.status ? d : { ...d, status: dealer.status }));
  }, [dealer.status]);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<string | null>(avatarUrl ?? null);
  const [photoBusy, setPhotoBusy] = React.useState(false);

  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch(`/api/dealers/${data.id}/avatar`, { method: "POST", body: form });
    setPhotoBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось загрузить фото");
      return;
    }
    const j = await res.json();
    setPhoto((j.url as string) ?? null);
    toast.success("Фото обновлено");
    router.refresh();
  }

  async function removePhoto() {
    setPhotoBusy(true);
    const res = await fetch(`/api/dealers/${data.id}/avatar`, { method: "DELETE" });
    setPhotoBusy(false);
    if (!res.ok) {
      toast.error("Не удалось удалить фото");
      return;
    }
    setPhoto(null);
    toast.success("Фото удалено");
    router.refresh();
  }

  async function update(payload: Record<string, unknown>, action = "update") {
    setBusy(action);
    const res = await fetch(`/api/dealers/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return false;
    }
    return true;
  }

  async function approve() {
    if (busy) return;
    if (await update({ status: "APPROVED" }, "status")) {
      setData((d) => ({ ...d, status: "APPROVED" }));
      toast.success("Дилер одобрен");
      router.refresh();
    }
  }
  async function reject() {
    if (rejectReason.trim().length < 6) {
      toast.error("Минимум 6 символов");
      return;
    }
    if (busy) return;
    if (await update({ status: "REJECTED", rejectionReason: rejectReason }, "status")) {
      setData((d) => ({ ...d, status: "REJECTED" }));
      toast.success("Заявка отклонена");
      setRejectOpen(false);
      router.refresh();
    }
  }
  async function suspend() {
    if (busy) return;
    const next = data.status === "SUSPENDED" ? "APPROVED" : "SUSPENDED";
    if (await update({ status: next }, "status")) {
      setData((d) => ({ ...d, status: next }));
      toast.success(next === "APPROVED" ? "Разблокирован" : "Заблокирован");
      router.refresh();
    }
  }

  async function saveProfile() {
    if (!data.dealerProfile) return;
    if (await update({
      profile: data.dealerProfile,
    })) {
      toast.success("Профиль обновлён");
      router.refresh();
    }
  }

  const fio = fioFromParts({
    firstName: data.dealerProfile?.firstName,
    lastName: data.dealerProfile?.lastName,
    middleName: data.dealerProfile?.middleName,
  });

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar name={fio || data.email} src={photo} size={56} />
                {canEdit ? (
                  <label
                    title="Изменить фото"
                    className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-accent text-white cursor-pointer transition-opacity hover:opacity-90"
                  >
                    {photoBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadPhoto(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div>
                <div className="font-display text-2xl  tracking-tightest">
                  {fio || "—"}
                </div>
                <div className="text-sm text-ink-muted">{data.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  <StatusTag kind="user" status={data.status} />
                  <Tag tone="muted">Заявка от {formatRuDateTime(data.createdAt)}</Tag>
                </div>
                {photo && canEdit ? (
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={photoBusy}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Удалить фото
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.status === "PENDING" ? (
                <>
                  <Button
                    disabled={!canApprove}
                    title={canApprove ? undefined : "Нет права на одобрение дилеров"}
                    loading={busy === "status"} onClick={approve}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Одобрить
                  </Button>
                  <Button
                    variant="ghostDanger"
                    disabled={!canApprove}
                    title={canApprove ? undefined : "Нет права на отклонение заявок"}
                    onClick={() => setRejectOpen(true)}
                    icon={<XCircle className="h-4 w-4" />}
                  >
                    Отклонить
                  </Button>
                </>
              ) : null}
              {data.status === "REJECTED" ? (
                <Button
                  disabled={!canApprove}
                  title={canApprove ? "Пересмотреть отклонённую заявку и одобрить" : "Нет права на одобрение дилеров"}
                  loading={busy === "status"} onClick={approve}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Одобрить
                </Button>
              ) : null}
              {data.status === "APPROVED" ? (
                <Button
                  variant="ghost"
                  disabled={!canManageStatus}
                  title={canManageStatus ? undefined : "Нет права на блокировку дилеров"}
                  icon={<ShieldOff className="h-4 w-4" />}
                  loading={busy === "status"} onClick={suspend}
                >
                  Заблокировать
                </Button>
              ) : null}
              {data.status === "SUSPENDED" ? (
                <Button
                  disabled={!canManageStatus}
                  title={canManageStatus ? undefined : "Нет права на разблокировку дилеров"}
                  icon={<ShieldCheck className="h-4 w-4" />}
                  loading={busy === "status"} onClick={suspend}
                >
                  Разблокировать
                </Button>
              ) : null}
              {deletable ? (
                <DeleteDealerButton dealerId={data.id} name={fio || data.email} redirectTo="/admin/dealers" />
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Личные данные</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Фамилия"
              disabled={!canEdit}
              value={data.dealerProfile?.lastName ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, lastName: e.target.value } })
              }
            />
            <Input
              label="Имя"
              disabled={!canEdit}
              value={data.dealerProfile?.firstName ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, firstName: e.target.value } })
              }
            />
            <Input
              label="Отчество"
              disabled={!canEdit}
              value={data.dealerProfile?.middleName ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, middleName: e.target.value } })
              }
            />
            <Input
              label="Телефон"
              disabled={!canEdit}
              value={data.dealerProfile?.phone ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, phone: e.target.value } })
              }
            />
            <Input
              label="Организация"
              disabled={!canEdit}
              value={data.dealerProfile?.organization ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, organization: e.target.value } })
              }
            />
            <Input
              label="ИНН"
              disabled={!canEdit}
              value={data.dealerProfile?.inn ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, inn: e.target.value } })
              }
            />
            <Input
              label="Страна"
              placeholder="Россия"
              disabled={!canEdit}
              value={data.dealerProfile?.country ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, country: e.target.value } })
              }
            />
            <Input
              label="Регион"
              disabled={!canEdit}
              value={data.dealerProfile?.region ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, region: e.target.value } })
              }
            />
            <Input
              label="Город"
              disabled={!canEdit}
              value={data.dealerProfile?.city ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, city: e.target.value } })
              }
            />
            <Input
              label="Адрес"
              disabled={!canEdit}
              value={data.dealerProfile?.address ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, address: e.target.value } })
              }
            />
            <Input
              label="Подпись на сайте"
              placeholder="Например: имя или район"
              maxLength={200}
              disabled={!canEdit}
              value={data.dealerProfile?.siteComment ?? ""}
              onChange={(e) =>
                setData({ ...data, dealerProfile: data.dealerProfile && { ...data.dealerProfile, siteComment: e.target.value } })
              }
            />
            <Input
              label="Лимит лицензий"
              type="number"
              min={0}
              disabled={!canSetLimit}
              title={canSetLimit ? undefined : "Нет права на изменение лимита"}
              value={String(data.dealerProfile?.licenseLimit ?? 0)}
              onChange={(e) =>
                setData({
                  ...data,
                  dealerProfile:
                    data.dealerProfile && { ...data.dealerProfile, licenseLimit: Number(e.target.value || 0) },
                })
              }
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              loading={busy === "update"}
              disabled={!canEdit}
              title={canEdit ? undefined : "Нет права на редактирование дилеров"}
              onClick={saveProfile}
              icon={<Save className="h-4 w-4" />}
            >
              Сохранить
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        {passwordCard ?? null}
        {sitePublication ? sitePublication : null}

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Доступ к ЛК DriveMods</div>
          <Toggle
            checked={!!data.dealerProfile?.driveModsAccess}
            disabled={!canEdit}
            onChange={async (v) => {
              if (!canEdit) return;
              setData({
                ...data,
                dealerProfile: data.dealerProfile && { ...data.dealerProfile, driveModsAccess: v },
              });
              await update({ profile: { driveModsAccess: v } });
              router.refresh();
            }}
            label={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Есть доступ к ЛК DriveMods
              </span>
            }
            description="Видно только администраторам. Часть типов лицензий выдаётся только там."
          />
          {data.dealerProfile?.driveModsRequestedAt && !data.dealerProfile?.driveModsAccess ? (
            <div className="mt-3 rounded-panel border border-hairline p-3 text-xs text-ink-muted">
              Представитель запросил доступ {formatRuDateTime(data.dealerProfile.driveModsRequestedAt)}.
            </div>
          ) : null}
        </Card>

        {data.dealerProfile ? (
          <Card>
            <div className="font-display text-lg tracking-tight mb-4">Старый ЛК DriveMods</div>
            <Toggle
              checked={data.dealerProfile.legacyDealer}
              disabled={!canSetLegacy}
              onChange={async (v) => {
                if (!canSetLegacy) return;
                const prev = data.dealerProfile?.legacyDealer ?? false;
                setData((d) => ({ ...d, dealerProfile: d.dealerProfile && { ...d.dealerProfile, legacyDealer: v } }));
                if (await update({ profile: { legacyDealer: v } }, "legacy")) {
                  toast.success(v ? "Отмечен как дилер из старого ЛК" : "Отметка снята");
                  router.refresh();
                } else {
                  setData((d) => ({
                    ...d,
                    dealerProfile: d.dealerProfile && { ...d.dealerProfile, legacyDealer: prev },
                  }));
                }
              }}
              label={
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" /> Работал в старом ЛК
                </span>
              }
              description="Первая генерация каждой позиции идёт по дилерской цене, а не по клиентской, как у новичков."
            />
            {legacy ? (
              <div className="mt-3 rounded-panel border border-hairline p-3 text-xs text-ink-muted space-y-1">
                <div className="text-ink">
                  {legacy.name}
                  {legacy.city ? ` · ${legacy.city}` : ""}
                </div>
                <div>
                  Лицензий в старом ЛК: <span className="text-ink">{legacy.licenses}</span> на{" "}
                  <span className="text-ink">{formatRub(legacy.amountTotal)}</span>
                </div>
                {legacy.firstLicenseAt && legacy.lastLicenseAt ? (
                  <div>
                    {formatRuDate(legacy.firstLicenseAt)} — {formatRuDate(legacy.lastLicenseAt)}
                  </div>
                ) : null}
                <Link href={`/admin/legacy-dealers?q=${encodeURIComponent(legacy.name)}`} className="text-accent hover:underline">
                  Статистика старого ЛК
                </Link>
              </div>
            ) : (
              <div className="mt-3 text-xs text-ink-subtle">
                В выгрузке старого ЛК совпадений по email и телефону нет. Привязать запись можно в разделе{" "}
                <Link href="/admin/legacy-dealers" className="text-accent hover:underline">
                  «Старый ЛК DriveMods»
                </Link>
                .
              </div>
            )}
          </Card>
        ) : null}

        <Card>
          <div className="font-display text-lg  tracking-tight mb-2">Лимит лицензий</div>
          <div className="font-display text-3xl  tracking-tightest">
            {data.dealerProfile?.licensesUsed ?? 0}
            <span className="text-base text-ink-muted font-normal">
              {" "}/ {data.dealerProfile?.licenseLimit ?? 0}
            </span>
          </div>
          <div className="text-xs text-ink-muted mt-1">не оплачено / лимит</div>
          <div className="text-xs text-ink-subtle mt-2">
            Лимит — сколько лицензий представитель может держать неоплаченными. Оплата освобождает место.
          </div>
        </Card>
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Отклонить заявку"
        description="Дилер увидит причину при попытке входа."
      >
        <Textarea
          label="Причина отклонения (минимум 6 символов)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>Отмена</Button>
          <Button variant="danger" disabled={!canApprove} loading={busy === "status"} onClick={reject} icon={<Ban className="h-4 w-4" />}>
            Отклонить
          </Button>
        </div>
      </Modal>
    </div>
  );
}

