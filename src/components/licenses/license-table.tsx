"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Download,
  Pencil,
  XCircle,
  Trash2,
  RotateCcw,
  Filter,
} from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { fileSafeName } from "@/components/licenses/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";
import { LICENSE_TYPE_FILTER_OPTIONS } from "@/lib/license-options";

type License = {
  id: string;
  number: string;
  type: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "REVOKED" | "DRAFT";
  termStart: Date | string;
  termEnd: Date | string;
  product?: string | null;
  versionSoftware?: string | null;
  customerFio: string;
  customerOrganization?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  cancellationReason?: string | null;
  licenseKey?: string | null;
  deletedAt?: Date | string | null;
  dealerId: string;
  platform?: string | null;
  issuedWithoutPayment?: boolean;
};

export function LicenseTable({
  licenses,
  basePath,
  context,
  initialQuery,
  initialStatus,
  initialType,
}: {
  licenses: License[];
  basePath: string;
  context: "dealer" | "admin";
  initialQuery: string;
  initialStatus: string;
  initialType: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { can } = usePermissions();
  const isAdmin = context === "admin";
  const canDownload = !isAdmin || can("licenses.view");
  const canEdit = !isAdmin || can("licenses.edit");
  const canCancel = !isAdmin || can("licenses.cancel");
  const canDelete = isAdmin && can("licenses.delete");
  const [q, setQ] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);
  const [type, setType] = React.useState(initialType);
  const [showFilters, setShowFilters] = React.useState(false);

  const debouncedPush = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushQuery(next: { q: string; status: string; type: string }) {
    const url = new URL(window.location.href);
    if (next.q) url.searchParams.set("q", next.q);
    else url.searchParams.delete("q");
    if (next.status) url.searchParams.set("status", next.status);
    else url.searchParams.delete("status");
    if (next.type) url.searchParams.set("type", next.type);
    else url.searchParams.delete("type");
    url.searchParams.delete("page");
    router.replace(`${pathname}${url.search}`);
  }

  React.useEffect(() => {
    if (debouncedPush.current) clearTimeout(debouncedPush.current);
    debouncedPush.current = setTimeout(() => {
      pushQuery({ q, status, type });
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, type]);

  const [cancelTarget, setCancelTarget] = React.useState<License | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelLoading, setCancelLoading] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<License | null>(null);
  const [deleteReason, setDeleteReason] = React.useState("");
  const [deleteLoading, setDeleteLoading] = React.useState(false);

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
      a.download = fileSafeName(`${license.number}-license.bin`);
      a.click();
    }
  }

  return (
    <>
      <div className="rounded-panel bg-card-light p-3.5 mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-panel bg-white px-4 h-11 flex-1 min-w-[240px]">
            <Search className="h-4 w-4 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Номер, ФИО, email, телефон, организация..."
              className="bg-transparent w-full text-sm placeholder:text-ink-subtle"
            />
          </div>
          <Button
            variant={showFilters ? "primary" : "secondary"}
            size="md"
            icon={<Filter className="h-4 w-4" />}
            onClick={() => setShowFilters((v) => !v)}
          >
            Фильтры
          </Button>
        </div>
        {showFilters ? (
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <Select
              label="Статус"
              value={status}
              onChange={(v) => setStatus(v)}
              placeholder="Все статусы"
              options={[
                { value: "", label: "Все статусы" },
                { value: "ACTIVE", label: "Активные" },
                { value: "EXPIRED", label: "Истекли" },
                { value: "CANCELLED", label: "Аннулированы" },
                { value: "REVOKED", label: "Отозваны" },
                { value: "DRAFT", label: "Черновики" },
              ]}
            />
            <Select
              label="Тип лицензии"
              value={type}
              onChange={(v) => setType(v)}
              placeholder="Все типы лицензий"
              options={LICENSE_TYPE_FILTER_OPTIONS}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-panel bg-card-light p-2.5">
        <div className="overflow-x-auto scrollbar-clean rounded-panel bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                <th className="px-4 py-3">Номер</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Email / Тел.</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Версия ПО</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                    Лицензий по фильтру не найдено
                  </td>
                </tr>
              ) : null}
              {licenses.map((l, i) => (
                <tr
                  key={l.id}
                  className={i > 0 ? "" : ""}
                  style={i > 0 ? { boxShadow: "inset 0 1px 0 #c1cbe1" } : undefined}
                >
                  <td className="px-4 py-3">
                    <Link href={`${basePath}/${l.id}`} className=" text-ink hover:text-accent">
                      {l.number}
                    </Link>
                    {l.issuedWithoutPayment ? (
                      <div className="mt-1">
                        <Tag tone="warning">Без оплаты</Tag>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={l.type === "Генерация" ? "accent" : "neutral"}>{l.type}</Tag>
                    {l.product ? (
                      <div className="text-xs text-ink-muted mt-1">{l.product}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="">{l.customerFio}</div>
                    {l.customerOrganization ? (
                      <div className="text-xs text-ink-muted">{l.customerOrganization}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs">
                    {l.customerEmail ? <div>{l.customerEmail}</div> : null}
                    {l.customerPhone ? <div>{l.customerPhone}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag kind="license" status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs break-all">
                    {l.versionSoftware || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.licenseKey ? (
                        <Button
                          size="sm"
                          variant="ghost"
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
                          <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />}>
                            Редактировать
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          title="Нет права на редактирование"
                          icon={<Pencil className="h-4 w-4" />}
                        >
                          Редактировать
                        </Button>
                      )}
                      {l.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canCancel}
                          title={canCancel ? undefined : "Нет права на аннулирование"}
                          icon={<XCircle className="h-4 w-4" />}
                          onClick={() => setCancelTarget(l)}
                        >
                          {isAdmin ? "Аннулировать" : "Запросить аннулирование"}
                        </Button>
                      ) : null}
                      {isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canDelete}
                          title={canDelete ? undefined : "Нет права на удаление"}
                          icon={<Trash2 className="h-4 w-4" />}
                          onClick={() => setDeleteTarget(l)}
                        >
                          Удалить
                        </Button>
                      ) : null}
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
    </>
  );
}

// re-export not used here, RotateCcw is for restore page, keep import via JSX
void RotateCcw;
