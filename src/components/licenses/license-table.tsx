"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Search, Download, Pencil, XCircle, Trash2, RotateCcw, CheckCircle2 } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { DealerMultiSelect, type DealerOption } from "@/components/ui/dealer-multi-select";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { useStoredColumns } from "@/hooks/use-stored-columns";
import { LICENSE_KIND_FILTER_OPTIONS } from "@/lib/license-options";
import { LICENSE_STATUS_FILTER_OPTIONS } from "@/lib/status-labels";
import { defaultLicenseColumns, licenseColumnLabel, type LicenseColumnKey } from "@/lib/license-columns";
import { formatRuDateTime } from "@/lib/dates";
import { formatRub, parseMoney } from "@/lib/money";
import { cn, plural } from "@/lib/utils";

type License = {
  id: string;
  number: string;
  type: string;
  status: "ACTIVE" | "CANCELLED";
  product?: string | null;
  bundle?: string | null;
  versionSoftware?: string | null;
  versionCustom?: string | null;
  dealerComment?: string | null;
  cancellationReason?: string | null;
  licenseKey?: string | null;
  deletedAt?: Date | string | null;
  dealerId: string;
  issuedWithoutPayment?: boolean;
  repeatGeneration?: boolean;
  price?: number | null;
  createdAt: string;
  dealerName?: string;
  dealerSub?: string;
  /** По лицензии есть заявка на аннулирование или возврат «на рассмотрении». */
  pendingCancellation?: boolean;
  pendingRequestKind?: "CANCEL" | "REFUND" | null;
  paymentStatus?: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | null;
  paymentAmount?: number | null;
  paidManually?: boolean;
};

const LICENSES: [string, string, string] = ["лицензия", "лицензии", "лицензий"];

/** Оплаченную онлайн или возвращённую лицензию вручную не отмечают. */
function canMarkLicensePaid(l: License): boolean {
  if (l.paymentStatus === "REFUNDED") return false;
  return l.paymentStatus !== "PAID" || l.paidManually === true;
}

export type LicenseFilters = {
  q: string;
  status: string;
  type: string;
  product: string;
  dealers: string[];
};

export function LicenseTable({
  licenses,
  basePath,
  context,
  initial,
  products = [],
  dealers = [],
  actions,
}: {
  licenses: License[];
  basePath: string;
  context: "dealer" | "admin";
  initial: LicenseFilters;
  /** Продукты для фильтра «Продукт». */
  products?: string[];
  /** Дилеры для фильтра — только в админке. */
  dealers?: DealerOption[];
  /** Кнопки страницы (например «Новая лицензия») — встают в один ряд с поиском. */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { can } = usePermissions();
  const isAdmin = context === "admin";
  const canDownload = !isAdmin || can("licenses.view");
  const canEdit = !isAdmin || can("licenses.edit");
  const canCancel = !isAdmin || can("licenses.cancel");
  const canDelete = isAdmin && can("licenses.delete");
  const canBulkPay = isAdmin && can("payments.manage");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSelected(new Set()), [licenses]);
  const selectable = React.useMemo(() => licenses.filter(canMarkLicensePaid), [licenses]);
  const pageSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));
  const [paidOpen, setPaidOpen] = React.useState(false);
  const [paidSame, setPaidSame] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState("");
  const [paidLoading, setPaidLoading] = React.useState(false);
  const [q, setQ] = React.useState(initial.q);
  const [status, setStatus] = React.useState(initial.status);
  const [type, setType] = React.useState(initial.type);
  const [product, setProduct] = React.useState(initial.product);
  const [dealerIds, setDealerIds] = React.useState<string[]>(initial.dealers);

  const defaultColumns = React.useMemo(() => defaultLicenseColumns(context), [context]);
  const [columns, setColumns] = useStoredColumns(`mmb-license-columns-${context}`, defaultColumns);
  const visibleKeys = React.useMemo(() => columns.filter((c) => c.visible).map((c) => c.key), [columns]);

  const debouncedPush = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushQuery(next: LicenseFilters) {
    const url = new URL(window.location.href);
    const set = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set("q", next.q);
    set("status", next.status);
    set("type", next.type);
    set("product", next.product);
    set("dealers", next.dealers.join(","));
    url.searchParams.delete("page");
    router.replace(`${pathname}${url.search}`);
  }

  React.useEffect(() => {
    if (debouncedPush.current) clearTimeout(debouncedPush.current);
    debouncedPush.current = setTimeout(() => {
      pushQuery({ q, status, type, product, dealers: dealerIds });
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, type, product, dealerIds]);

  const productOptions = React.useMemo(() => {
    const list = product && !products.includes(product) ? [product, ...products] : products;
    return [{ value: "", label: "Все продукты" }, ...list.map((p) => ({ value: p, label: p }))];
  }, [products, product]);

  const [cancelTarget, setCancelTarget] = React.useState<License | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelLoading, setCancelLoading] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<License | null>(null);
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const [withdrawTarget, setWithdrawTarget] = React.useState<License | null>(null);
  const [withdrawLoading, setWithdrawLoading] = React.useState(false);

  async function onWithdraw() {
    if (!withdrawTarget) return;
    setWithdrawLoading(true);
    const res = await fetch(`/api/licenses/${withdrawTarget.id}/cancel-request`, {
      method: "DELETE",
    });
    setWithdrawLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось отменить заявку");
      return;
    }
    toast.success("Заявка отменена");
    setWithdrawTarget(null);
    router.refresh();
  }

  async function onCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 10) {
      toast.error("Укажите причину (минимум 10 символов)");
      return;
    }
    setCancelLoading(true);
    const endpoint = isAdmin
      ? `/api/licenses/${cancelTarget.id}/cancel`
      : `/api/licenses/${cancelTarget.id}/cancel-request`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason }),
    });
    setCancelLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? (isAdmin ? "Не удалось аннулировать" : "Не удалось отправить заявку"));
      return;
    }
    toast.success(isAdmin ? "Лицензия аннулирована" : "Заявка на аннулирование отправлена");
    setCancelTarget(null);
    setCancelReason("");
    router.refresh();
  }

  async function onDelete() {
    if (!deleteTarget) return;
    if (deleteReason.trim().length < 6) {
      toast.error("Укажите причину");
      return;
    }
    setDeleteLoading(true);
    const res = await fetch(`/api/licenses/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: deleteReason }),
    });
    setDeleteLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить");
      return;
    }
    toast.success("Лицензия перемещена в корзину");
    setDeleteTarget(null);
    setDeleteReason("");
    router.refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onMarkPaid() {
    const amount = paidSame ? parseMoney(paidAmount) : null;
    if (paidSame && (amount === null || amount < 0)) {
      toast.error("Укажите сумму — можно 0");
      return;
    }
    setPaidLoading(true);
    const res = await fetch("/api/licenses/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], ...(paidSame ? { amount } : {}) }),
    });
    setPaidLoading(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Не удалось отметить оплату");
      return;
    }
    const marked = Number(j.marked ?? 0);
    const errors: string[] = j.errors ?? [];
    if (marked > 0) toast.success(`Отмечено оплаченными: ${marked} ${plural(marked, LICENSES)}. Чеки не пробиваются.`);
    else if (!errors.length) toast.message("Выбранные лицензии уже оплачены на эти суммы");
    if (errors.length) toast.error(`Не отмечено ${errors.length}: ${errors[0]}`);
    setPaidOpen(false);
    router.refresh();
  }

  async function onDownload(license: License) {
    const res = await fetch(`/api/licenses/${license.id}/download`);
    if (!res.ok) {
      toast.error("Не удалось получить ссылку");
      return;
    }
    const j = await res.json();
    if (j.url) {
      const a = document.createElement("a");
      a.href = j.url;
      a.download = "device-license.bin";
      a.click();
    }
  }

  function renderCell(l: License, key: LicenseColumnKey): React.ReactNode {
    switch (key) {
      case "number":
        return (
          <>
            <Link href={`${basePath}/${l.id}`} className="whitespace-nowrap text-ink hover:text-accent">
              {l.number}
            </Link>
            {l.issuedWithoutPayment ? (
              <div className="mt-1">
                <Tag tone="warning">Без оплаты</Tag>
              </div>
            ) : null}
          </>
        );
      case "createdAt":
        return <span className="whitespace-nowrap text-ink-muted">{formatRuDateTime(l.createdAt)}</span>;
      case "type":
        return l.repeatGeneration ? (
          <Tag tone="warning">Повторная генерация</Tag>
        ) : (
          <Tag tone={l.type === "Генерация" ? "accent" : "neutral"}>{l.type}</Tag>
        );
      case "product":
        return l.product ? (
          <div>
            <div>{l.product}</div>
            {l.bundle ? <div className="text-xs text-ink-muted">{l.bundle}</div> : null}
          </div>
        ) : (
          <span className="text-ink-muted">—</span>
        );
      case "dealer":
        return (
          <div className="min-w-[160px]">
            <Link href={`/admin/dealers/${l.dealerId}`} className="hover:text-accent">
              {l.dealerName || "—"}
            </Link>
            {l.dealerSub ? <div className="text-xs text-ink-muted">{l.dealerSub}</div> : null}
          </div>
        );
      case "dealerComment":
        return l.dealerComment ? (
          <span
            className="line-clamp-2 max-w-[260px] whitespace-pre-line break-words text-ink-muted"
            title={l.dealerComment}
          >
            {l.dealerComment}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        );
      case "status":
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusTag kind="license" status={l.status} />
            <PendingRequestTag license={l} href={`${basePath}/${l.id}`} />
          </div>
        );
      case "payment":
        if (!l.paymentStatus) {
          return (
            <span className="whitespace-nowrap text-ink-muted">
              {l.issuedWithoutPayment || !l.price ? "Не требуется" : "Счёт не выставлен"}
            </span>
          );
        }
        return (
          <div className="whitespace-nowrap">
            <StatusTag kind="payment" status={l.paymentStatus} />
            <div className="mt-1 text-xs text-ink-muted">
              {formatRub(l.paymentAmount ?? 0)}
              {isAdmin && l.paidManually && l.paymentStatus === "PAID" ? " · вручную" : ""}
            </div>
          </div>
        );
      case "versionSoftware":
        return <span className="text-xs text-ink-muted break-all">{l.versionSoftware || "—"}</span>;
      case "versionCustom":
        return <span className="text-ink-muted">{l.versionCustom || "—"}</span>;
      case "price":
        return (
          <span className="whitespace-nowrap">
            {l.price === null || l.price === undefined
              ? "—"
              : l.price === 0
                ? "Бесплатно"
                : formatRub(l.price)}
          </span>
        );
    }
  }

  return (
    <>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-panel border border-hairline px-4 h-11 flex-1 min-w-[240px] transition-colors focus-within:border-accent">
            <Search className="h-4 w-4 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                isAdmin
                  ? "Номер, продукт, комментарий, версия ПО, дилер..."
                  : "Номер, продукт, комментарий дилера, версия ПО..."
              }
              className="bg-transparent w-full text-sm placeholder:text-ink-subtle"
            />
          </div>
          {actions}
        </div>
        <div className={cn("grid gap-3 mt-3", isAdmin ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
          <Select
            label="Тип лицензии"
            value={type}
            onChange={(v) => setType(v)}
            placeholder="Все типы лицензий"
            options={LICENSE_KIND_FILTER_OPTIONS}
          />
          <Select
            label="Статус"
            value={status}
            onChange={(v) => setStatus(v)}
            placeholder="Все статусы"
            options={LICENSE_STATUS_FILTER_OPTIONS}
          />
          <Select
            label="Продукт"
            value={product}
            onChange={(v) => setProduct(v)}
            placeholder="Все продукты"
            options={productOptions}
            searchable={productOptions.length > 8}
            searchPlaceholder="Поиск продукта"
          />
          {isAdmin ? <DealerMultiSelect options={dealers} value={dealerIds} onChange={setDealerIds} /> : null}
        </div>
        <div className="mt-3 hidden md:flex justify-end">
          <ColumnsMenu
            columns={columns}
            labelOf={licenseColumnLabel}
            onChange={setColumns}
            onReset={() => setColumns(defaultColumns)}
          />
        </div>
      </div>

      {canBulkPay && selected.size > 0 ? (
        <div className="sticky top-2 z-20 mb-3 hidden md:flex flex-wrap items-center gap-2 rounded-panel border border-accent/30 bg-surface px-4 py-2.5 shadow-[0_12px_32px_-20px_rgba(11,16,32,0.35)]">
          <span className="text-sm">
            Выбрано {selected.size} {plural(selected.size, LICENSES)}
          </span>
          <button type="button" className="text-sm text-ink-muted hover:text-accent" onClick={() => setSelected(new Set())}>
            Снять выбор
          </button>
          <div className="ml-auto">
            <Button
              size="sm"
              icon={<CheckCircle2 className="h-4 w-4" />}
              onClick={() => {
                setPaidSame(false);
                setPaidAmount("");
                setPaidOpen(true);
              }}
            >
              Отметить оплаченными
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-panel border border-hairline overflow-hidden">
        {/* Мобильное представление: карточки вместо горизонтальной прокрутки. */}
        <ul className="md:hidden divide-y divide-hairline">
          {licenses.length === 0 ? (
            <li className="px-4 py-12 text-center text-ink-muted">Лицензий по фильтру не найдено</li>
          ) : null}
          {licenses.map((l) => (
            <li key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`${basePath}/${l.id}`}
                    className="font-display tracking-tight text-ink hover:text-accent"
                  >
                    {l.number}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {l.repeatGeneration ? (
                      <Tag tone="warning">Повторная генерация</Tag>
                    ) : (
                      <Tag tone={l.type === "Генерация" ? "accent" : "neutral"}>{l.type}</Tag>
                    )}
                    {l.issuedWithoutPayment ? <Tag tone="warning">Без оплаты</Tag> : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusTag kind="license" status={l.status} />
                  <PendingRequestTag license={l} href={`${basePath}/${l.id}`} />
                  {l.paymentStatus ? <StatusTag kind="payment" status={l.paymentStatus} /> : null}
                </div>
              </div>
              <div className="mt-2 text-xs text-ink-muted">
                {[formatRuDateTime(l.createdAt), l.product].filter(Boolean).join(" · ")}
              </div>
              {isAdmin && l.dealerName ? (
                <div className="mt-1 text-xs text-ink-muted">Дилер: {l.dealerName}</div>
              ) : null}
              {l.dealerComment ? (
                <div className="mt-1 line-clamp-2 whitespace-pre-line break-words text-xs text-ink-muted">
                  {l.dealerComment}
                </div>
              ) : null}
              {l.versionSoftware ? (
                <div className="mt-1 text-xs text-ink-muted break-all">Версия ПО: {l.versionSoftware}</div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.licenseKey ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canDownload}
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => onDownload(l)}
                  >
                    Скачать
                  </Button>
                ) : null}
                {canEdit ? (
                  <Link href={`${basePath}/${l.id}`}>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />}>
                      Редактировать
                    </Button>
                  </Link>
                ) : null}
                {l.status === "ACTIVE" && !isAdmin && l.pendingCancellation ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => setWithdrawTarget(l)}
                  >
                    Отменить заявку
                  </Button>
                ) : null}
                {l.status === "ACTIVE" && !(!isAdmin && l.pendingCancellation) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canCancel}
                    icon={<XCircle className="h-4 w-4" />}
                    onClick={() => setCancelTarget(l)}
                  >
                    {isAdmin ? "Аннулировать" : "Запросить аннулирование"}
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button
                    size="sm"
                    variant="ghostDanger"
                    disabled={!canDelete}
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setDeleteTarget(l)}
                  >
                    Удалить
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden md:block overflow-x-auto scrollbar-clean">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                {canBulkPay ? (
                  <th className="w-10 py-3 pl-4 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Выбрать все на странице"
                      title="Выбрать для отметки оплаты"
                      className="h-4 w-4 accent-[#2a9fff]"
                      disabled={selectable.length === 0}
                      checked={pageSelected}
                      onChange={() =>
                        setSelected(pageSelected ? new Set() : new Set(selectable.map((l) => l.id)))
                      }
                    />
                  </th>
                ) : null}
                {visibleKeys.map((key) => (
                  <th key={key} className="px-4 py-3 whitespace-nowrap">
                    {licenseColumnLabel(key)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleKeys.length + (canBulkPay ? 2 : 1)}
                    className="px-4 py-12 text-center text-ink-muted"
                  >
                    Лицензий по фильтру не найдено
                  </td>
                </tr>
              ) : null}
              {licenses.map((l) => (
                <tr
                  key={l.id}
                  className={cn("transition-colors hover:bg-surface-muted", selected.has(l.id) && "bg-accent/5")}
                >
                  {canBulkPay ? (
                    <td className="w-10 py-3 pl-4 pr-0 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${l.number}`}
                        className="mt-0.5 h-4 w-4 accent-[#2a9fff] disabled:opacity-40"
                        disabled={!canMarkLicensePaid(l)}
                        title={canMarkLicensePaid(l) ? undefined : "Оплачено онлайн или возвращено — отметка не нужна"}
                        checked={selected.has(l.id)}
                        onChange={() => toggleSelected(l.id)}
                      />
                    </td>
                  ) : null}
                  {visibleKeys.map((key) => (
                    <td key={key} className="px-4 py-3 align-top">
                      {renderCell(l, key)}
                    </td>
                  ))}
                  <td className="px-4 py-3 align-top">
                    {/* Действия идут парами в столбик: так строка не растягивается
                        на четыре кнопки в ряд. */}
                    <div className="flex items-start justify-end gap-1.5">
                      <div className="flex flex-col items-stretch gap-1.5">
                        {l.licenseKey ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start"
                            disabled={!canDownload}
                            title={canDownload ? undefined : "Нет права на скачивание"}
                            icon={<Download className="h-4 w-4" />}
                            onClick={() => onDownload(l)}
                          >
                            Скачать
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <Link href={`${basePath}/${l.id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full justify-start"
                              icon={<Pencil className="h-4 w-4" />}
                            >
                              Редактировать
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start"
                            disabled
                            title="Нет права на редактирование"
                            icon={<Pencil className="h-4 w-4" />}
                          >
                            Редактировать
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-col items-stretch gap-1.5">
                        {l.status === "ACTIVE" ? (
                          (() => {
                            // Пока заявка на рассмотрении, дилер не шлёт вторую, а
                            // может отозвать текущую (иначе статус «не меняется»).
                            if (!isAdmin && l.pendingCancellation) {
                              return (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="w-full justify-start"
                                  icon={<RotateCcw className="h-4 w-4" />}
                                  onClick={() => setWithdrawTarget(l)}
                                >
                                  Отменить заявку
                                </Button>
                              );
                            }
                            const label = isAdmin ? "Аннулировать" : "Запросить аннулирование";
                            return (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start"
                                disabled={!canCancel}
                                title={canCancel ? undefined : "Нет права на аннулирование"}
                                icon={<XCircle className="h-4 w-4" />}
                                onClick={() => setCancelTarget(l)}
                              >
                                {label}
                              </Button>
                            );
                          })()
                        ) : null}
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="ghostDanger"
                            className="w-full justify-start"
                            disabled={!canDelete}
                            title={canDelete ? undefined : "Нет права на удаление"}
                            icon={<Trash2 className="h-4 w-4" />}
                            onClick={() => setDeleteTarget(l)}
                          >
                            Удалить
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`${isAdmin ? "Аннулировать" : "Заявка на аннулирование"} ${cancelTarget?.number ?? ""}`}
        description={
          isAdmin
            ? "Уведомление будет отправлено администраторам. Действие можно будет восстановить только через админа."
            : "Заявка поступит администратору. Лицензия будет аннулирована после одобрения."
        }
      >
        <div className="space-y-3">
          <Textarea
            label="Причина аннулирования (обязательно)"
            placeholder="Например: ошибочно выбран тип ECO вместо FULL..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={4}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelTarget(null)}>
            Отмена
          </Button>
          <Button variant="danger" loading={cancelLoading} icon={<XCircle className="h-4 w-4" />} onClick={onCancel}>
            {isAdmin ? "Аннулировать" : "Отправить заявку"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!withdrawTarget}
        onClose={() => setWithdrawTarget(null)}
        title={`Отменить заявку ${withdrawTarget?.number ?? ""}`}
        description={`Заявка на ${
          withdrawTarget?.pendingRequestKind === "REFUND" ? "возврат" : "аннулирование"
        } будет снята с рассмотрения. Позже её можно подать заново.`}
      >
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setWithdrawTarget(null)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={withdrawLoading}
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={onWithdraw}
          >
            Отменить заявку
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Удалить ${deleteTarget?.number ?? ""}`}
        description="Лицензия попадёт в корзину и может быть восстановлена."
      >
        <div className="space-y-3">
          <Textarea
            label="Причина удаления"
            placeholder="Опишите причину..."
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            rows={3}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Отмена
          </Button>
          <Button variant="danger" loading={deleteLoading} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>
            Удалить
          </Button>
        </div>
      </Modal>

      <Modal
        open={paidOpen}
        onClose={() => setPaidOpen(false)}
        title={`Отметить оплаченными ${selected.size} ${plural(selected.size, LICENSES)}`}
        description="Деньги получены мимо онлайн-оплаты. Чеки в налоговую не пробиваются, неоплаченные счета закрываются, дилеры получат уведомление."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaidOpen(false)}>
              Отмена
            </Button>
            <Button loading={paidLoading} icon={<CheckCircle2 className="h-4 w-4" />} onClick={onMarkPaid}>
              Отметить оплаченными
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Toggle
            checked={paidSame}
            onChange={setPaidSame}
            label="Одна сумма для всех"
            description="Иначе — сумма выставленного счёта, а без счёта — цена лицензии."
          />
          {paidSame ? (
            <MoneyInput
              label="Оплаченная сумма за каждую лицензию, ₽"
              value={paidAmount}
              onChange={setPaidAmount}
              hint="Можно указать любую сумму, в том числе 0."
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function PendingRequestTag({ license, href }: { license: License; href: string }) {
  if (!license.pendingCancellation) return null;
  const label = license.pendingRequestKind === "REFUND" ? "Заявка на возврат" : "Заявка на аннулирование";
  return (
    <Link href={href} className="rounded-full transition-opacity hover:opacity-80" title="Открыть заявку в карточке лицензии">
      <Tag tone="warning">{label}</Tag>
    </Link>
  );
}
