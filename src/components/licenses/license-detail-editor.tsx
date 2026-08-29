"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Download,
  XCircle,
  RotateCcw,
  History,
  Pencil,
  Mail,
  Phone,
  User as UserIcon,
  Building2,
  Car,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { formatRuDateTime, formatRuDate } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";
import { LICENSE_PLATFORM_OPTIONS, LICENSE_TYPE_OPTIONS } from "@/lib/license-options";

type AuditEntry = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string | Date;
  actor: { email: string };
};
type LicenseShape = {
  id: string;
  number: string;
  type: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "REVOKED" | "DRAFT";
  features: Record<string, boolean | string>;
  termStart: string | Date;
  termEnd: string | Date;
  customerFio: string;
  customerOrganization: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  region: string | null;
  city: string | null;
  vehicleVin: string | null;
  vehicleModel: string | null;
  cancellationReason: string | null;
  cancelledAt: string | Date | null;
  licenseKey: string | null;
  deviceId: string | null;
  platform: string | null;
  issuedWithoutPayment: boolean;
  product: string | null;
  bundle: string | null;
  productRegion: string | null;
  versionSoftware: string | null;
  versionCustom: string | null;
  dealerComment: string | null;
  auditLogs: AuditEntry[];
  dealerId: string;
};

type CancellationRequestInfo = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  reviewNote: string | null;
  createdAt: string | Date;
};

export function LicenseDetailEditor({
  license,
  context,
  latestRequest = null,
}: {
  license: LicenseShape;
  context: "dealer" | "admin";
  latestRequest?: CancellationRequestInfo | null;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const isAdmin = context === "admin";
  const canEdit = !isAdmin || can("licenses.edit");
  const canDownload = !isAdmin || can("licenses.view");
  const canCancel = !isAdmin || can("licenses.cancel");
  const canRevoke = isAdmin && can("licenses.revoke");
  const [data, setData] = React.useState(license);
  const [saving, setSaving] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [revokeReason, setRevokeReason] = React.useState("");
  const [revokeLoading, setRevokeLoading] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [requestReason, setRequestReason] = React.useState("");
  const [requestLoading, setRequestLoading] = React.useState(false);
  const hasPendingRequest = latestRequest?.status === "PENDING";

  async function requestCancellation() {
    if (requestReason.trim().length < 10) {
      toast.error("Минимум 10 символов");
      return;
    }
    setRequestLoading(true);
    const res = await fetch(`/api/licenses/${data.id}/cancel-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: requestReason }),
    });
    setRequestLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось отправить заявку");
      return;
    }
    toast.success("Заявка на аннулирование отправлена");
    setRequestOpen(false);
    setRequestReason("");
    router.refresh();
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/licenses/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.type,
        features: data.features,
        termStart: new Date(data.termStart).toISOString(),
        termEnd: new Date(data.termEnd).toISOString(),
        customerFio: data.customerFio,
        customerOrganization: data.customerOrganization || null,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        region: data.region || null,
        city: data.city || null,
        vehicleVin: data.vehicleVin || null,
        vehicleModel: data.vehicleModel || null,
        platform: data.platform || null,
        ...(context === "admin" && data.status ? { status: data.status } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success("Сохранено");
    router.refresh();
  }

  async function cancelNow() {
    if (cancelReason.trim().length < 10) {
      toast.error("Минимум 10 символов");
      return;
    }
    setCancelLoading(true);
    const res = await fetch(`/api/licenses/${data.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    setCancelLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Аннулировано");
    setCancelOpen(false);
    router.refresh();
  }

  async function revokeNow() {
    if (revokeReason.trim().length < 6) {
      toast.error("Минимум 6 символов");
      return;
    }
    setRevokeLoading(true);
    const res = await fetch(`/api/licenses/${data.id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason }),
    });
    setRevokeLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Отозвано");
    setRevokeOpen(false);
    router.refresh();
  }

  async function download() {
    const res = await fetch(`/api/licenses/${data.id}/download`);
    if (!res.ok) {
      toast.error("Не удалось получить ссылку");
      return;
    }
    const j = await res.json();
    if (j.url) {
      const a = document.createElement("a");
      a.href = j.url;
      a.download = `${data.number}-license.bin`;
      a.click();
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-muted">Лицензия</div>
              <div className="mt-1 font-display text-3xl  tracking-tightest">{data.number}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusTag status={data.status} />
                <Tag tone={data.type === "Генерация" ? "accent" : "neutral"}>{data.type}</Tag>
                {data.platform ? <Tag tone="neutral">{data.platform}</Tag> : null}
                {data.issuedWithoutPayment ? <Tag tone="warning">Без оплаты</Tag> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.licenseKey ? (
                <Button
                  variant="secondary"
                  disabled={!canDownload}
                  title={canDownload ? undefined : "Нет права на скачивание"}
                  icon={<Download className="h-4 w-4" />}
                  onClick={download}
                >
                  Скачать .bin
                </Button>
              ) : null}
              {!isAdmin && data.status === "ACTIVE" ? (
                <Button
                  variant="ghost"
                  disabled={hasPendingRequest}
                  title={hasPendingRequest ? "Заявка уже на рассмотрении" : undefined}
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => setRequestOpen(true)}
                >
                  Запросить аннулирование
                </Button>
              ) : null}
              {isAdmin && data.status === "ACTIVE" ? (
                <Button
                  variant="ghost"
                  disabled={!canCancel}
                  title={canCancel ? undefined : "Нет права на аннулирование"}
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => setCancelOpen(true)}
                >
                  Аннулировать
                </Button>
              ) : null}
              {isAdmin && (data.status === "ACTIVE" || data.status === "CANCELLED") ? (
                <Button
                  variant="ghost"
                  disabled={!canRevoke}
                  title={canRevoke ? undefined : "Нет права на отзыв"}
                  icon={<ShieldOff className="h-4 w-4" />}
                  onClick={() => setRevokeOpen(true)}
                >
                  Отозвать
                </Button>
              ) : null}
            </div>
          </div>
          {data.cancellationReason ? (
            <div className="mt-5 rounded-panel bg-white p-4">
              <div className="text-xs text-ink-subtle">Причина аннулирования / отзыва</div>
              <div className="mt-1 text-sm">{data.cancellationReason}</div>
              {data.cancelledAt ? (
                <div className="text-xs text-ink-muted mt-1">{formatRuDateTime(data.cancelledAt)}</div>
              ) : null}
            </div>
          ) : null}
          {latestRequest ? (
            <div className="mt-5 rounded-panel bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-ink-subtle">Заявка на аннулирование</div>
                <Tag
                  tone={
                    latestRequest.status === "PENDING"
                      ? "warning"
                      : latestRequest.status === "APPROVED"
                        ? "success"
                        : "muted"
                  }
                >
                  {latestRequest.status === "PENDING"
                    ? "На рассмотрении"
                    : latestRequest.status === "APPROVED"
                      ? "Одобрена"
                      : "Отклонена"}
                </Tag>
              </div>
              <div className="mt-1.5 text-sm">{latestRequest.reason}</div>
              <div className="text-xs text-ink-muted mt-1">{formatRuDateTime(latestRequest.createdAt)}</div>
              {latestRequest.reviewNote ? (
                <div className="mt-2 text-xs text-ink-muted">Комментарий: {latestRequest.reviewNote}</div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Тип лицензии</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Select
              label="Тип лицензии"
              disabled={!canEdit}
              value={data.type}
              onChange={(v) => setData({ ...data, type: v })}
              options={LICENSE_TYPE_OPTIONS}
            />
            <Select
              label="Тип платформы"
              disabled={!canEdit}
              value={data.platform ?? ""}
              onChange={(v) => setData({ ...data, platform: v || null })}
              placeholder="Не указана"
              options={[{ value: "", label: "Не указана" }, ...LICENSE_PLATFORM_OPTIONS]}
            />
            {isAdmin ? (
              <Select
                label="Статус"
                disabled={!canEdit}
                value={data.status}
                onChange={(v) => setData({ ...data, status: v as LicenseShape["status"] })}
                options={[
                  { value: "ACTIVE", label: "Активна" },
                  { value: "CANCELLED", label: "Аннулирована" },
                ]}
              />
            ) : null}
          </div>
          <div className="divider my-5" />
          <div className="grid sm:grid-cols-2 gap-3">
            <ReadonlyField label="Продукт" value={data.product} />
            <ReadonlyField label="Версия ПО" value={data.versionSoftware} />
            <ReadonlyField label="Версия кастома" value={data.versionCustom} />
            <ReadonlyField label="ID устройства" value={data.deviceId ?? null} />
            <ReadonlyField label="Комментарий дилера" value={data.dealerComment} />
          </div>
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Клиент</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="ФИО"
              disabled={!canEdit}
              icon={<UserIcon className="h-4 w-4" />}
              value={data.customerFio}
              onChange={(e) => setData({ ...data, customerFio: e.target.value })}
            />
            <Input
              label="Организация"
              disabled={!canEdit}
              icon={<Building2 className="h-4 w-4" />}
              value={data.customerOrganization ?? ""}
              onChange={(e) => setData({ ...data, customerOrganization: e.target.value })}
            />
            <Input
              label="Email"
              disabled={!canEdit}
              icon={<Mail className="h-4 w-4" />}
              value={data.customerEmail ?? ""}
              onChange={(e) => setData({ ...data, customerEmail: e.target.value })}
            />
            <Input
              label="Телефон"
              disabled={!canEdit}
              icon={<Phone className="h-4 w-4" />}
              value={data.customerPhone ?? ""}
              onChange={(e) => setData({ ...data, customerPhone: e.target.value })}
            />
            <Input
              label="Регион"
              disabled={!canEdit}
              value={data.region ?? ""}
              onChange={(e) => setData({ ...data, region: e.target.value })}
            />
            <Input
              label="Город"
              disabled={!canEdit}
              value={data.city ?? ""}
              onChange={(e) => setData({ ...data, city: e.target.value })}
            />
            <Input
              label="VIN"
              disabled={!canEdit}
              icon={<Car className="h-4 w-4" />}
              value={data.vehicleVin ?? ""}
              onChange={(e) => setData({ ...data, vehicleVin: e.target.value })}
            />
            <Input
              label="Модель"
              disabled={!canEdit}
              value={data.vehicleModel ?? ""}
              onChange={(e) => setData({ ...data, vehicleModel: e.target.value })}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              loading={saving}
              disabled={!canEdit}
              title={canEdit ? undefined : "Нет права на редактирование"}
              icon={<Save className="h-4 w-4" />}
              onClick={save}
            >
              Сохранить изменения
            </Button>
          </div>
        </Card>
      </div>

      <Card className="h-fit">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-accent" />
          <div className="font-display  tracking-tight">Аудит</div>
        </div>
        <ul className="space-y-3.5">
          {data.auditLogs.map((entry) => (
            <li key={entry.id} className="rounded-panel bg-white p-3">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <Tag tone={mapAuditTone(entry.action)}>{labelAction(entry.action)}</Tag>
                <span>{formatRuDate(entry.createdAt)}</span>
              </div>
              <div className="text-sm mt-1.5">{entry.actor.email}</div>
              {entry.reason ? <div className="text-xs text-ink-muted mt-1.5">{entry.reason}</div> : null}
            </li>
          ))}
          {data.auditLogs.length === 0 ? (
            <li className="text-sm text-ink-muted">Записей пока нет</li>
          ) : null}
        </ul>
      </Card>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Аннулировать лицензию"
        description="Уведомление поступит администраторам."
      >
        <Textarea
          label="Причина (обязательно, минимум 10 символов)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={4}
          placeholder="Например: ошибочно выбран тип ECO вместо FULL..."
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>Отмена</Button>
          <Button variant="danger" loading={cancelLoading} icon={<XCircle className="h-4 w-4" />} onClick={cancelNow}>
            Аннулировать
          </Button>
        </div>
      </Modal>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Заявка на аннулирование"
        description="Заявка поступит администратору. Лицензия будет аннулирована после одобрения."
      >
        <Textarea
          label="Причина (обязательно, минимум 10 символов)"
          value={requestReason}
          onChange={(e) => setRequestReason(e.target.value)}
          rows={4}
          placeholder="Например: клиент вернул устройство, лицензия больше не нужна..."
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRequestOpen(false)}>Отмена</Button>
          <Button
            variant="danger"
            loading={requestLoading}
            icon={<XCircle className="h-4 w-4" />}
            onClick={requestCancellation}
          >
            Отправить заявку
          </Button>
        </div>
      </Modal>

      <Modal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="Отозвать лицензию"
        description="Отзыв означает принудительное прекращение действия."
      >
        <Textarea
          label="Причина (минимум 6 символов)"
          value={revokeReason}
          onChange={(e) => setRevokeReason(e.target.value)}
          rows={4}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRevokeOpen(false)}>Отмена</Button>
          <Button variant="danger" loading={revokeLoading} icon={<ShieldOff className="h-4 w-4" />} onClick={revokeNow}>
            Отозвать
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-panel bg-white p-3">
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-1 text-sm break-all">{value || "—"}</div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case "ACTIVE":
      return <Tag tone="success">Активна</Tag>;
    case "EXPIRED":
      return <Tag tone="muted">Истекла</Tag>;
    case "CANCELLED":
      return <Tag tone="warning">Аннулирована</Tag>;
    case "REVOKED":
      return <Tag tone="danger">Отозвана</Tag>;
    case "DRAFT":
      return <Tag tone="neutral">Черновик</Tag>;
    default:
      return <Tag tone="neutral">{status}</Tag>;
  }
}

function labelAction(a: string): string {
  switch (a) {
    case "CREATED":
      return "Создана";
    case "EDITED":
      return "Изменена";
    case "CANCELLED":
      return "Аннулирована";
    case "REVOKED":
      return "Отозвана";
    case "DELETED":
      return "Удалена";
    case "RESTORED":
      return "Восстановлена";
    case "EXPIRED":
      return "Истекла";
    default:
      return a;
  }
}

function mapAuditTone(action: string): "neutral" | "accent" | "warning" | "danger" | "success" | "muted" {
  switch (action) {
    case "CREATED":
      return "success";
    case "EDITED":
      return "accent";
    case "CANCELLED":
      return "warning";
    case "REVOKED":
      return "danger";
    case "DELETED":
      return "danger";
    case "RESTORED":
      return "success";
    case "EXPIRED":
      return "muted";
    default:
      return "neutral";
  }
}

void Pencil;
void RotateCcw;
