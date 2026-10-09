"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Tag } from "@/components/ui/tag";
import { Toggle } from "@/components/ui/toggle";
import { usePermissions } from "@/hooks/use-permissions";
import { formatRuDate, formatRuDateTime } from "@/lib/dates";
import { formatRub, parseMoney } from "@/lib/money";
import { LEGACY_PAYMENT_LABEL, LK_TYPE_LABEL, legacyPaymentTone, legacyPosition } from "@/lib/legacy-labels";
import { plural } from "@/lib/utils";
import type { LegacyCandidate } from "./legacy-link-button";

export type LegacyRecordRow = {
  id: string;
  lkType: number;
  createdAt: string;
  licenseType: string | null;
  product: string | null;
  bundle: string | null;
  region: string | null;
  version: string | null;
  versionCustom: string | null;
  eolType: string | null;
  priceTotal: number | null;
  /** Сумма в самом ЛК DriveMods — цена для MMB RUSSIA. */
  priceLk: number | null;
  paymentStatus: string;
  dealerComment: string | null;
  authorName: string | null;
  /** Когда лицензию погасила оплата. */
  paidAt: string | null;
  paidItems: number | null;
  legacyDealer: { id: string; label: string } | null;
  user: { id: string; label: string } | null;
  manualAssign: boolean;
  /** Оплату отметил администратор портала. */
  manualPayment: boolean;
  assignedAt: string | null;
  assignedBy: string | null;
};

type Filter = { tab: "licenses" | "payments" | "other"; q?: string; owner?: string; pay?: string; dealer?: string; user?: string };

const th = "px-3 py-2.5 text-left text-xs font-normal text-ink-muted whitespace-nowrap";
const td = "px-3 py-2.5 align-top";

export function RecordsTable({
  rows,
  tab,
  total,
  filter,
  canEdit,
}: {
  rows: LegacyRecordRow[];
  tab: Filter["tab"];
  total: number;
  filter: Filter;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canMarkPaid = can("payments.manage") && tab !== "payments";
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [paidOpen, setPaidOpen] = React.useState(false);
  const [paidSame, setPaidSame] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<LegacyCandidate[] | null>(null);
  const [withPayments, setWithPayments] = React.useState(true);

  React.useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [rows]);

  React.useEffect(() => {
    if (!assignOpen) return;
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/legacy-dealers/candidates?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const j = await res.json().catch(() => ({}));
        setResults(res.ok ? (j.items ?? []) : []);
      } catch {
        // запрос отменён новым вводом
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, assignOpen]);

  const pageIds = rows.map((r) => r.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const noun: [string, string, string] =
    tab === "licenses"
      ? ["лицензия", "лицензии", "лицензий"]
      : tab === "payments"
        ? ["оплата", "оплаты", "оплат"]
        : ["запись", "записи", "записей"];

  function toggle(id: string) {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setAllMatching(false);
    setSelected(pageSelected ? new Set() : new Set(pageIds));
  }

  async function submit(action: "assign" | "reset", userId?: string) {
    setBusy(userId ?? action);
    try {
      const res = await fetch("/api/legacy-records/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userId,
          ...(allMatching ? { filter } : { ids: [...selected] }),
          withPayments: tab === "licenses" ? withPayments : false,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Не удалось сохранить");
        return;
      }
      const n = Number(j.count ?? 0);
      toast.success(
        action === "assign"
          ? `Назначено ${n} ${plural(n, ["запись", "записи", "записей"])}`
          : `Возвращено к автоматическому: ${n}`,
      );
      setAssignOpen(false);
      setResetOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function markPaid() {
    const amount = paidSame ? parseMoney(paidAmount) : null;
    if (paidSame && (amount === null || amount < 0)) {
      toast.error("Укажите сумму — можно 0");
      return;
    }
    setBusy("paid");
    try {
      const res = await fetch("/api/legacy-records/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(allMatching ? { filter } : { ids: [...selected] }),
          ...(paidSame ? { amount } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Не удалось отметить оплату");
        return;
      }
      const n = Number(j.count ?? 0);
      toast.success(`Отмечено оплаченными: ${n} ${plural(n, ["запись", "записи", "записей"])}`);
      setPaidOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const candidates = results ?? [];
  const canSelect = canEdit || canMarkPaid;

  return (
    <>
      {canSelect && count > 0 ? (
        <div className="sticky top-2 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-panel border border-accent/30 bg-surface px-4 py-2.5 shadow-[0_12px_32px_-20px_rgba(11,16,32,0.35)]">
          <span className="text-sm">
            Выбрано {count.toLocaleString("ru-RU")} {plural(count, noun)}
            {allMatching ? " — все по фильтру" : ""}
          </span>
          {!allMatching && pageSelected && total > rows.length ? (
            <button type="button" className="text-sm text-accent hover:underline" onClick={() => setAllMatching(true)}>
              Выбрать все {total.toLocaleString("ru-RU")} по фильтру
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
                  Назначить дилеру
                </Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setResetOpen(true)}>
                  Вернуть автоматическое
                </Button>
              </>
            ) : null}
            {canMarkPaid ? (
              <Button
                size="sm"
                variant={canEdit ? "secondary" : "primary"}
                icon={<CheckCircle2 className="h-4 w-4" />}
                onClick={() => {
                  setPaidSame(false);
                  setPaidAmount("");
                  setPaidOpen(true);
                }}
              >
                Отметить оплаченными
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="w-9 px-0"
              aria-label="Снять выделение"
              title="Снять выделение"
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setSelected(new Set());
                setAllMatching(false);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-panel border border-hairline">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-ink-muted">Ничего не найдено</div>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-hairline bg-surface-muted/60">
              <tr>
                {canSelect ? (
                  <th className={`${th} w-10`}>
                    <input
                      type="checkbox"
                      aria-label="Выбрать все на странице"
                      className="h-4 w-4 accent-[#2a9fff]"
                      checked={pageSelected || allMatching}
                      onChange={togglePage}
                    />
                  </th>
                ) : null}
                <th className={th}>Дата</th>
                <th className={th}>{tab === "payments" ? "Оплата" : tab === "licenses" ? "Лицензия" : "Запись"}</th>
                {tab !== "payments" ? <th className={th}>Комментарий</th> : null}
                <th className={th}>Дилер старого ЛК</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th}>Дилер</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((r) => (
                <tr key={r.id} className={selected.has(r.id) || allMatching ? "bg-accent/5" : undefined}>
                  {canSelect ? (
                    <td className={td}>
                      <input
                        type="checkbox"
                        aria-label="Выбрать"
                        className="mt-0.5 h-4 w-4 accent-[#2a9fff]"
                        checked={allMatching || selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                  ) : null}
                  <td className={`${td} whitespace-nowrap`}>
                    <div>{formatRuDateTime(r.createdAt)}</div>
                    <div className="font-mono text-[11px] text-ink-subtle">{r.id}</div>
                  </td>
                  <td className={td}>
                    {tab === "payments" ? (
                      <>
                        <div>{LK_TYPE_LABEL[r.lkType] ?? "Оплата"}</div>
                        <div className="text-xs text-ink-muted">
                          {r.paidItems != null
                            ? `погашено ${r.paidItems} ${plural(r.paidItems, ["позиция", "позиции", "позиций"])}`
                            : "—"}
                        </div>
                      </>
                    ) : (
                      <>
                        <div>{tab === "licenses" ? legacyPosition(r) : `${LK_TYPE_LABEL[r.lkType] ?? "Запись"}${r.product ? ` · ${r.product}` : ""}`}</div>
                        {tab === "licenses" ? (
                          <div className="text-xs text-ink-muted">
                            {[
                              r.licenseType,
                              r.version ? `ПО ${r.version}` : null,
                              r.versionCustom ? `кастом ${r.versionCustom}` : null,
                              r.eolType ? `EOL ${r.eolType}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                  {tab !== "payments" ? (
                    <td className={`${td} max-w-[240px]`}>
                      <div className="truncate" title={r.dealerComment ?? undefined}>
                        {r.dealerComment || <span className="text-ink-subtle">—</span>}
                      </div>
                    </td>
                  ) : null}
                  <td className={`${td} max-w-[220px]`}>
                    {r.legacyDealer ? (
                      <Link
                        href={`/admin/legacy-dealers?tab=${tab}&dealer=${r.legacyDealer.id}`}
                        className="block truncate hover:text-accent"
                        title={r.legacyDealer.label}
                      >
                        {r.legacyDealer.label}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">не определён</span>
                    )}
                    {r.authorName ? <div className="truncate text-xs text-ink-muted">выписал: {r.authorName}</div> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {r.priceTotal != null && (r.priceTotal > 0 || tab !== "other") ? <div>{formatRub(r.priceTotal)}</div> : null}
                    {r.priceLk != null && r.priceLk !== r.priceTotal ? (
                      <div className="text-[11px] text-ink-subtle" title="Сумма в ЛК DriveMods">
                        в ЛК {formatRub(r.priceLk)}
                      </div>
                    ) : null}
                    {tab !== "other" || (r.priceTotal ?? 0) > 0 ? (
                      <Tag tone={legacyPaymentTone(r.paymentStatus)} className="mt-1 px-2 py-0.5 text-[11px]">
                        {LEGACY_PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}
                      </Tag>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                    {r.paidAt ? <div className="mt-1 text-[11px] text-ink-subtle">оплата {formatRuDate(r.paidAt)}</div> : null}
                    {r.manualPayment ? <div className="mt-1 text-[11px] text-strong-warning">отмечено вручную</div> : null}
                  </td>
                  <td className={`${td} max-w-[220px]`}>
                    {r.user ? (
                      <Link href={`/admin/dealers/${r.user.id}`} className="block truncate hover:text-accent" title={r.user.label}>
                        {r.user.label}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                    {r.manualAssign ? (
                      <div
                        className="mt-0.5 text-[11px] text-strong-warning"
                        title={[r.assignedAt ? formatRuDateTime(r.assignedAt) : null, r.assignedBy].filter(Boolean).join(" · ")}
                      >
                        назначено вручную
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Назначить ${count.toLocaleString("ru-RU")} ${plural(count, noun)}`}
        description="Выбранные записи появятся в кабинете дилера в разделе «ЛК DriveMods» и останутся за ним при повторном импорте и перепривязке дилеров."
      >
        <div className="space-y-3">
          {tab === "licenses" ? (
            <Toggle
              checked={withPayments}
              onChange={setWithPayments}
              label="Вместе с оплатами этих лицензий"
              description="Оплата, которой погашена лицензия, перейдёт к тому же дилеру."
            />
          ) : null}
          <Input
            autoFocus
            icon={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя, email, телефон, город…"
          />
          {results === null ? (
            <div className="text-[11.5px] uppercase tracking-tight text-ink-subtle">Начните вводить для поиска</div>
          ) : candidates.length === 0 ? (
            <div className="rounded-panel bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">Никого не нашли</div>
          ) : (
            <ul className="divide-y divide-hairline rounded-panel border border-hairline">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.fio || c.email}</div>
                    <div className="truncate text-xs text-ink-muted">{[c.email, c.city, c.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                  <Button size="sm" disabled={busy !== null} loading={busy === c.id} onClick={() => submit("assign", c.id)}>
                    Назначить
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={paidOpen}
        onClose={() => setPaidOpen(false)}
        title={`Отметить оплаченными ${count.toLocaleString("ru-RU")} ${plural(count, noun)}`}
        description="Отметка портала: в ЛК DriveMods ничего не меняется, чеки не пробиваются. Повторный импорт отметку не затрёт. Оплаты из ЛК среди выбранных пропускаются."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaidOpen(false)}>
              Отмена
            </Button>
            <Button loading={busy === "paid"} onClick={markPaid} icon={<CheckCircle2 className="h-4 w-4" />}>
              Отметить оплаченными
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Toggle
            checked={paidSame}
            onChange={setPaidSame}
            label="Задать одну сумму для всех"
            description="Иначе у каждой записи останется её сумма."
          />
          {paidSame ? (
            <MoneyInput
              label="Оплаченная сумма за каждую запись, ₽"
              value={paidAmount}
              onChange={setPaidAmount}
              hint="Можно указать любую сумму, в том числе 0."
            />
          ) : null}
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        size="sm"
        title="Вернуть автоматическое распределение?"
        description="Назначенные вручную записи снова достанутся дилеру, к которому привязан их дилер старого ЛК (или никому, если дилер не привязан). Остальные выбранные записи не изменятся."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Отмена
            </Button>
            <Button loading={busy === "reset"} onClick={() => submit("reset")} icon={<RotateCcw className="h-4 w-4" />}>
              Вернуть
            </Button>
          </>
        }
      />
    </>
  );
}
