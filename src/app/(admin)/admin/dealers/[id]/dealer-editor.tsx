"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Save, Ban, Eye, ShieldOff, ShieldCheck } from "lucide-react";
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
import { formatRuDate } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";

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
    address: string | null;
    licenseLimit: number;
    licensesUsed: number;
    phoneVisibleOnSite: boolean;
  } | null;
  role: { name: string };
};

export function DealerEditor({ dealer }: { dealer: Dealer }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canApprove = can("dealers.approve");
  const canEdit = can("dealers.edit");
  const canSetLimit = can("dealers.setLimit") || canEdit;
  const canManageStatus = canApprove || canEdit || can("dealers.suspend");
  const [data, setData] = React.useState(dealer);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function update(payload: Record<string, unknown>) {
    setBusy("update");
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
    if (await update({ status: "APPROVED" })) {
      toast.success("Дилер одобрен");
      router.refresh();
    }
  }
  async function reject() {
    if (rejectReason.trim().length < 6) {
      toast.error("Минимум 6 символов");
      return;
    }
    if (await update({ status: "REJECTED", rejectionReason: rejectReason })) {
      toast.success("Заявка отклонена");
      setRejectOpen(false);
      router.refresh();
    }
  }
  async function suspend() {
    if (await update({ status: data.status === "SUSPENDED" ? "APPROVED" : "SUSPENDED" })) {
      toast.success(data.status === "SUSPENDED" ? "Разблокирован" : "Заблокирован");
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
              <Avatar name={fio || data.email} size={56} />
              <div>
                <div className="font-display text-2xl  tracking-tightest">
                  {fio || "—"}
                </div>
                <div className="text-sm text-ink-muted">{data.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  <StatusTag kind="user" status={data.status} />
                  <Tag tone="muted">Заявка от {formatRuDate(data.createdAt)}</Tag>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.status === "PENDING" ? (
                <>
                  <Button
                    disabled={!canApprove}
                    title={canApprove ? undefined : "Нет права на одобрение дилеров"}
                    onClick={approve}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Одобрить
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!canApprove}
                    title={canApprove ? undefined : "Нет права на отклонение заявок"}
                    onClick={() => setRejectOpen(true)}
                    icon={<XCircle className="h-4 w-4" />}
                  >
                    Отклонить
                  </Button>
                </>
              ) : null}
              {data.status === "APPROVED" ? (
                <Button
                  variant="ghost"
                  disabled={!canManageStatus}
                  title={canManageStatus ? undefined : "Нет права на блокировку дилеров"}
                  icon={<ShieldOff className="h-4 w-4" />}
                  onClick={suspend}
                >
                  Заблокировать
                </Button>
              ) : null}
              {data.status === "SUSPENDED" ? (
                <Button
                  disabled={!canManageStatus}
                  title={canManageStatus ? undefined : "Нет права на разблокировку дилеров"}
                  icon={<ShieldCheck className="h-4 w-4" />}
                  onClick={suspend}
                >
                  Разблокировать
                </Button>
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
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Публикация на сайте</div>
          <Toggle
            checked={!!data.dealerProfile?.phoneVisibleOnSite}
            disabled={!canEdit}
            onChange={async (v) => {
              if (!canEdit) return;
              setData({
                ...data,
                dealerProfile: data.dealerProfile && { ...data.dealerProfile, phoneVisibleOnSite: v },
              });
              await update({ profile: { phoneVisibleOnSite: v } });
              router.refresh();
            }}
            label={
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Показывать телефон на сайте
              </span>
            }
            description="Сразу же отражается в публичном API /api/public/representatives."
          />
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-2">Лимит лицензий</div>
          <div className="font-display text-3xl  tracking-tightest">
            {data.dealerProfile?.licensesUsed ?? 0}
            <span className="text-base text-ink-muted font-normal">
              {" "}/ {data.dealerProfile?.licenseLimit ?? 0}
            </span>
          </div>
          <div className="text-xs text-ink-muted mt-1">использовано / всего</div>
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
          <Button variant="danger" disabled={!canApprove} onClick={reject} icon={<Ban className="h-4 w-4" />}>
            Отклонить
          </Button>
        </div>
      </Modal>
    </div>
  );
}

