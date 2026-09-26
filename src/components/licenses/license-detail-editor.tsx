"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Save,
  Download,
  XCircle,
  History,
  RotateCcw,
  Pencil,
  Wallet,
  Undo2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { formatRuDateTime } from "@/lib/dates";
import { formatRub, parseMoney } from "@/lib/money";
import { usePermissions } from "@/hooks/use-permissions";
import { LICENSE_TYPE_OPTIONS } from "@/lib/license-options";

type AuditEntry = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string | Date;
  actor: { email: string };
};

type PaymentInfo = {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  amount: string | number;
  provider: string;
  paidAt: string | Date | null;
  refundedAt: string | Date | null;
  refundMethod: string | null;
};

type LicenseShape = {
  id: string;
  number: string;
  type: string;
  status: "ACTIVE" | "CANCELLED";
  features: Record<string, boolean | string>;
  cancellationReason: string | null;
  cancelledAt: string | Date | null;
  licenseKey: string | null;
  deviceId: string | null;
  issuedWithoutPayment: boolean;
  repeatGeneration: boolean;
  product: string | null;
  bundle: string | null;
  productRegion: string | null;
  versionSoftware: string | null;
  versionCustom: string | null;
  dealerComment: string | null;
  price: string | number | null;
  /** Есть только в админке: представителю базовую цену не отдаём. */
  basePrice?: string | number | null;
  payment: PaymentInfo | null;
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

const DISCOUNTS = [10, 15, 20, 30, 50];

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function moneyField(v: number | null): string {
  return v === null ? "" : String(v).replace(".", ",");
}

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
  // Запись генерации, стоимость и статус — коммерческие условия лицензии: их
  // меняет только администратор с соответствующим правом.
  const canEditTerms = isAdmin && can("licenses.manageTerms");
  const canEditComment = !isAdmin || can("licenses.edit");
  const canDownload = !isAdmin || can("licenses.view");
  const canCancel = !isAdmin || can("licenses.cancel");

  const [data, setData] = React.useState(license);
  React.useEffect(() => setData(license), [license]);
  const [saving, setSaving] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [requestReason, setRequestReason] = React.useState("");
  const [requestLoading, setRequestLoading] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [withdrawLoading, setWithdrawLoading] = React.useState(false);
  const hasPendingRequest = latestRequest?.status === "PENDING";

  const [commentEditing, setCommentEditing] = React.useState(false);
  const [commentDraft, setCommentDraft] = React.useState(license.dealerComment ?? "");
  const [commentSaving, setCommentSaving] = React.useState(false);

  const price = toNumber(data.price);
  const basePrice = toNumber(data.basePrice);
  const payment = data.payment;
  const refunded = payment?.status === "REFUNDED";

  const [priceOpen, setPriceOpen] = React.useState(false);
  const [priceDraft, setPriceDraft] = React.useState(moneyField(price));
  const [baseDraft, setBaseDraft] = React.useState(moneyField(basePrice));
  const [priceReason, setPriceReason] = React.useState("");
  const [priceSaving, setPriceSaving] = React.useState(false);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/licenses/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return false;
    }
    return true;
  }

  async function withdrawRequest() {
    setWithdrawLoading(true);
    const res = await fetch(`/api/licenses/${data.id}/cancel-request`, {
      method: "DELETE",
    });
    setWithdrawLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось отменить заявку");
      return;
    }
    toast.success("Заявка отменена");
    setWithdrawOpen(false);
    router.refresh();
  }

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

  async function saveRecord() {
    setSaving(true);
    const ok = await patch({
      type: data.type,
      status: data.status,
      product: data.product ?? "",
      bundle: data.bundle ?? "",
      productRegion: data.productRegion ?? "",
      versionSoftware: data.versionSoftware ?? "",
      versionCustom: data.versionCustom ?? "",
    });
    setSaving(false);
    if (!ok) return;
    toast.success("Запись генерации сохранена");
    router.refresh();
  }

  async function saveComment() {
    const next = commentDraft.trim();
    if (!next) {
      toast.error("Комментарий не может быть пустым");
      return;
    }
    setCommentSaving(true);
    const ok = await patch({ dealerComment: next });
    setCommentSaving(false);
    if (!ok) return;
    setData((d) => ({ ...d, dealerComment: next }));
    setCommentEditing(false);
    toast.success("Комментарий сохранён");
    router.refresh();
  }

  function openPrice() {
    setPriceDraft(moneyField(price));
    setBaseDraft(moneyField(basePrice));
    setPriceReason("");
    setPriceOpen(true);
  }

  async function savePrice() {
    const nextPrice = parseMoney(priceDraft);
    if (nextPrice === null || nextPrice < 0) {
      toast.error("Укажите стоимость");
      return;
    }
    const nextBase = parseMoney(baseDraft);
    const body: Record<string, unknown> = {};
    if (nextPrice !== price) body.price = nextPrice;
    if (nextBase !== basePrice) body.basePrice = nextBase;
    if (Object.keys(body).length === 0) {
      setPriceOpen(false);
      return;
    }
    if (priceReason.trim()) body.reason = priceReason.trim();
    setPriceSaving(true);
    const ok = await patch(body);
    setPriceSaving(false);
    if (!ok) return;
    toast.success("Стоимость обновлена");
    setPriceOpen(false);
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

  const paymentHref = payment ? (isAdmin ? "/admin/payments" : `/dealer/payments/${payment.id}`) : null;
  const priceLabel =
    price === null || price === 0
      ? data.repeatGeneration
        ? "Бесплатно (повторная генерация)"
        : "Бесплатно"
      : formatRub(price);
  const paymentLocked = payment?.status === "PAID" || payment?.status === "REFUNDED";
  const draftPrice = parseMoney(priceDraft);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-muted">Лицензия</div>
              <div className="mt-1 font-display text-3xl  tracking-tightest">{data.number}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusTag kind="license" status={data.status} />
                {data.repeatGeneration ? (
                  <Tag tone="warning">Повторная генерация</Tag>
                ) : (
                  <Tag tone={data.type === "Генерация" ? "accent" : "neutral"}>{data.type}</Tag>
                )}
                {data.issuedWithoutPayment ? <Tag tone="warning">Без оплаты</Tag> : null}
                {refunded ? <Tag tone="danger">Средства возвращены</Tag> : null}
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
              {!isAdmin && data.status === "ACTIVE" && !hasPendingRequest ? (
                <Button
                  variant="ghost"
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => setRequestOpen(true)}
                >
                  Запросить аннулирование
                </Button>
              ) : null}
              {!isAdmin && data.status === "ACTIVE" && hasPendingRequest ? (
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => setWithdrawOpen(true)}
                >
                  Отменить заявку
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
            </div>
          </div>
          {refunded ? (
            <div className="mt-5 rounded-panel border border-danger/30 bg-danger/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Undo2 className="h-4 w-4 text-danger" />
                Возврат средств {payment ? formatRub(payment.amount) : ""}
              </div>
              <div className="mt-1.5 text-sm text-ink-muted">
                {payment?.refundedAt ? `${formatRuDateTime(payment.refundedAt)} · ` : ""}
                {payment?.refundMethod === "atol_pay"
                  ? isAdmin
                    ? "Деньги вернул АТОЛ Pay на карту плательщика."
                    : "Деньги возвращены на карту, с которой вы платили. Банк зачисляет их обычно за 1–10 рабочих дней."
                  : isAdmin
                    ? "Возврат отмечен вручную — деньги возвращены мимо АТОЛ Pay."
                    : "Возврат оформлен администратором."}
              </div>
              <div className="mt-1.5 text-xs text-ink-muted">
                Лицензия аннулирована и больше не действует.
                {!isAdmin ? " Если нужна новая — оформите её в разделе «Новая лицензия»." : ""}
              </div>
            </div>
          ) : null}
          {data.cancellationReason && !refunded ? (
            <div className="mt-5 rounded-panel border border-hairline p-4">
              <div className="text-xs text-ink-subtle">Причина аннулирования</div>
              <div className="mt-1 text-sm">{data.cancellationReason}</div>
              {data.cancelledAt ? (
                <div className="text-xs text-ink-muted mt-1">{formatRuDateTime(data.cancelledAt)}</div>
              ) : null}
            </div>
          ) : null}
          {latestRequest ? (
            <div className="mt-5 rounded-panel border border-hairline p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-ink-subtle">Заявка на аннулирование</div>
                <StatusTag kind="request" status={latestRequest.status} />
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              <div className="font-display text-lg tracking-tight">Стоимость и оплата</div>
            </div>
            {canEditTerms ? (
              <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={openPrice}>
                Изменить стоимость
              </Button>
            ) : null}
          </div>
          <div className={isAdmin ? "grid sm:grid-cols-3 gap-3" : "grid sm:grid-cols-2 gap-3"}>
            <InfoTile label={isAdmin ? "Цена для представителя" : "Стоимость"}>
              <span className="font-display text-xl tracking-tight">{priceLabel}</span>
            </InfoTile>
            {isAdmin ? (
              <InfoTile label="Базовая цена" hint="Видна только администраторам">
                <span className="font-display text-xl tracking-tight">
                  {basePrice === null ? "—" : formatRub(basePrice)}
                </span>
                {basePrice !== null && price !== null && price > 0 ? (
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Маржа {formatRub(price - basePrice)}
                  </span>
                ) : null}
              </InfoTile>
            ) : null}
            <InfoTile label="Оплата">
              {payment ? (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag kind="payment" status={payment.status} />
                  {paymentHref ? (
                    <Link
                      href={paymentHref}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      {isAdmin ? "Платежи" : "Открыть счёт"} <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ) : (
                <span className="text-sm text-ink-muted">
                  {price === null || price === 0 ? "Оплата не требуется" : "Счёт не выставлен"}
                </span>
              )}
              {payment?.paidAt && payment.status !== "REFUNDED" ? (
                <span className="mt-1 block text-xs text-ink-muted">
                  Оплачено {formatRuDateTime(payment.paidAt)}
                </span>
              ) : null}
            </InfoTile>
          </div>
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">Запись генерации</div>
          {canEditTerms ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Тип лицензии"
                  value={data.type}
                  onChange={(v) => setData({ ...data, type: v })}
                  options={LICENSE_TYPE_OPTIONS}
                />
                <Select
                  label="Статус"
                  value={data.status}
                  onChange={(v) => setData({ ...data, status: v as LicenseShape["status"] })}
                  options={[
                    { value: "ACTIVE", label: "Активна" },
                    { value: "CANCELLED", label: "Аннулирована" },
                  ]}
                />
                <Input
                  label="Продукт"
                  value={data.product ?? ""}
                  onChange={(e) => setData({ ...data, product: e.target.value })}
                />
                <Input
                  label="Комплектация"
                  value={data.bundle ?? ""}
                  placeholder="FULL, ECO…"
                  onChange={(e) => setData({ ...data, bundle: e.target.value })}
                />
                <Input
                  label="Регион продукта"
                  value={data.productRegion ?? ""}
                  placeholder="RUS, CHN…"
                  onChange={(e) => setData({ ...data, productRegion: e.target.value })}
                />
                <Input
                  label="Версия кастома"
                  value={data.versionCustom ?? ""}
                  onChange={(e) => setData({ ...data, versionCustom: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Версия ПО"
                    value={data.versionSoftware ?? ""}
                    onChange={(e) => setData({ ...data, versionSoftware: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3 text-xs text-ink-muted">
                Правка меняет запись на портале; выданный файл лицензии остаётся прежним.
              </div>
            </>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <ReadonlyField label="Тип лицензии" value={data.type} />
              <ReadonlyField label="Продукт" value={data.product} />
              <ReadonlyField label="Комплектация" value={data.bundle} />
              <ReadonlyField label="Регион продукта" value={data.productRegion} />
              <ReadonlyField label="Версия ПО" value={data.versionSoftware} />
              <ReadonlyField label="Версия кастома" value={data.versionCustom} />
            </div>
          )}
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {/* ID ШГУ — служебные данные: представителю он в карточке не нужен. */}
            {isAdmin ? (
              <ReadonlyField
                label="ID устройства (виден только администраторам)"
                value={data.deviceId ?? null}
              />
            ) : null}
            <div className={isAdmin ? "" : "sm:col-span-2"}>
              <div className="rounded-panel border border-hairline p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-tight text-ink-subtle">Комментарий дилера</div>
                  {canEditComment && !commentEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCommentDraft(data.dealerComment ?? "");
                        setCommentEditing(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> Изменить
                    </button>
                  ) : null}
                </div>
                {commentEditing ? (
                  <div className="mt-2">
                    <Textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      className="resize-y"
                      autoFocus
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setCommentEditing(false)}>
                        Отмена
                      </Button>
                      <Button size="sm" loading={commentSaving} icon={<Save className="h-4 w-4" />} onClick={saveComment}>
                        Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 whitespace-pre-line break-words text-sm">{data.dealerComment || "—"}</div>
                )}
              </div>
            </div>
          </div>
          {canEditTerms ? (
            <div className="mt-5 flex justify-end">
              <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={saveRecord}>
                Сохранить изменения
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="h-fit">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-accent" />
          <div className="font-display  tracking-tight">Аудит</div>
        </div>
        <ul className="divide-y divide-hairline border-t border-hairline">
          {data.auditLogs.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <Tag tone={mapAuditTone(entry.action)}>{labelAction(entry.action)}</Tag>
                <span>{formatRuDateTime(entry.createdAt)}</span>
              </div>
              <div className="text-sm mt-1.5">{entry.actor.email}</div>
              {entry.reason ? <div className="text-xs text-ink-muted mt-1.5">{entry.reason}</div> : null}
            </li>
          ))}
          {data.auditLogs.length === 0 ? (
            <li className="py-3 text-sm text-ink-muted">Записей пока нет</li>
          ) : null}
        </ul>
      </Card>

      <Modal
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        title="Стоимость лицензии"
        description="Скидка или бесплатная выдача после генерации."
      >
        <div className="space-y-4">
          <MoneyInput
            label="Цена для представителя, ₽"
            value={priceDraft}
            onChange={setPriceDraft}
            disabled={paymentLocked}
          />
          {!paymentLocked ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPriceDraft("0")}
                className="rounded-btn border border-hairline px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
              >
                Бесплатно
              </button>
              {price !== null && price > 0
                ? DISCOUNTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPriceDraft(moneyField(Math.round(price * (100 - d)) / 100))}
                      className="rounded-btn border border-hairline px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent"
                    >
                      −{d}%
                    </button>
                  ))
                : null}
            </div>
          ) : null}
          <div className="rounded-panel bg-surface-muted p-3 text-xs text-ink-muted">
            {paymentLocked
              ? payment?.status === "PAID"
                ? "Счёт уже оплачен — сумму не изменить. Вернуть деньги можно в разделе «Платежи» кнопкой «Вернуть средства»."
                : "По лицензии оформлен возврат — стоимость не меняется."
              : draftPrice === 0
                ? payment
                  ? "Счёт по лицензии будет отменён, оплачивать её не нужно."
                  : "Лицензия останется бесплатной."
                : payment
                  ? "Сумма неоплаченного счёта пересчитается, ссылка на оплату выпустится заново."
                  : "Представителю будет выставлен счёт на эту сумму."}
            {!paymentLocked ? " Представитель получит уведомление." : ""}
          </div>
          <MoneyInput
            label="Базовая цена, ₽"
            hint="Себестоимость для расчёта маржи — представитель её не видит"
            value={baseDraft}
            onChange={setBaseDraft}
          />
          <Textarea
            label="Пояснение (попадёт в аудит)"
            value={priceReason}
            onChange={(e) => setPriceReason(e.target.value)}
            rows={2}
            placeholder="Например: скидка за объём, договорились 5 авто"
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPriceOpen(false)}>
            Отмена
          </Button>
          <Button loading={priceSaving} icon={<Save className="h-4 w-4" />} onClick={savePrice}>
            Сохранить
          </Button>
        </div>
      </Modal>

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
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="Отменить заявку на аннулирование"
        description="Заявка будет снята с рассмотрения. Позже вы сможете подать её заново."
      >
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>Отмена</Button>
          <Button
            variant="danger"
            loading={withdrawLoading}
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={withdrawRequest}
          >
            Отменить заявку
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function InfoTile({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-hairline p-3">
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-1">{children}</div>
      {hint ? <div className="mt-1 text-[11px] text-ink-subtle">{hint}</div> : null}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-panel border border-hairline p-3">
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-1 text-sm break-all">{value || "—"}</div>
    </div>
  );
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
