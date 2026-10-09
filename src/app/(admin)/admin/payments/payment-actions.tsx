"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Receipt, RefreshCw, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { usePermissions } from "@/hooks/use-permissions";
import { parseMoney } from "@/lib/money";

type Action = "confirm" | "cancel" | "fiscalize" | "refresh-receipt" | "refund";

export function PaymentActions({
  id,
  status,
  receiptStatus,
  provider,
  amount,
  amountLabel,
  paidManually,
  refundStatus,
  refundReceiptStatus,
  part,
}: {
  /** Только действия с платежом или только удаление — в таблице это разные колонки. */
  part?: "manage" | "delete";
  id: string;
  status: string;
  receiptStatus: string | null;
  provider: string;
  amount: number;
  amountLabel: string;
  /** Оплату отметил администратор: чека нет, АТОЛ Pay при возврате не трогаем. */
  paidManually: boolean;
  refundStatus: string | null;
  refundReceiptStatus: string | null;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("payments.manage") && part !== "delete";
  const canRefund = can("payments.refund");
  const canDelete = can("payments.delete") && part !== "manage";
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundedManually, setRefundedManually] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [paidAmount, setPaidAmount] = React.useState("");

  async function run(action: Action, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const res = await fetch(`/api/payments/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Не удалось выполнить действие");
      // Неудачный возврат тоже меняет строку: появляется текст ошибки.
      if (action === "refund") router.refresh();
      return;
    }
    if (action === "refund") {
      const refundReceipt = json.payment?.refundReceiptStatus as string | null | undefined;
      toast.success(
        json.payment?.refundMethod === "atol_pay"
          ? "АТОЛ Pay принял возврат, деньги вернутся плательщику"
          : "Возврат отмечен",
        {
          description:
            refundReceipt === "fail"
              ? "Чек возврата не пробит — повторите из списка платежей"
              : refundReceipt
                ? "Чек возврата отправлен в кассу"
                : undefined,
        },
      );
    } else {
      toast.success(
        action === "confirm"
          ? "Оплата отмечена. Чек не пробивается: деньги прошли мимо кассы"
          : action === "cancel"
            ? "Платёж отменён"
            : action === "fiscalize"
              ? "Чек отправлен в кассу"
              : "Статус чека обновлён",
      );
    }
    setRefundOpen(false);
    setConfirmOpen(false);
    router.refresh();
  }

  function openRefund() {
    setRefundedManually(false);
    setRefundOpen(true);
  }

  function openConfirm() {
    setPaidAmount(String(amount));
    setConfirmOpen(true);
  }

  function confirmPaid() {
    const value = parseMoney(paidAmount);
    if (value === null || value < 0) {
      toast.error("Укажите оплаченную сумму — можно 0");
      return;
    }
    void run("confirm", { amount: value });
  }

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
    setDeleting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Не удалось удалить платёж");
      router.refresh();
      return;
    }
    toast.success("Запись о платеже удалена");
    setDeleteOpen(false);
    router.refresh();
  }

  if (!canManage && !canDelete) return null;

  const paid = status === "PAID";
  const refunded = status === "REFUNDED";
  // Чек нужен только по деньгам, которые прошли через нашу кассу.
  const needsReceipt = paid && !paidManually && receiptStatus !== "done";
  // Возвраты, отмеченные до появления настоящих возвратов, чек не получают:
  // деньги по ним могли и не вернуть.
  const needsRefundReceipt =
    refunded && refundStatus === "done" && receiptStatus === "done" && !["done", "wait"].includes(refundReceiptStatus ?? "");
  const waitingReceipt = (paid && receiptStatus === "wait") || (refunded && refundReceiptStatus === "wait");
  const onlinePayment = provider === "atol_pay" && !paidManually;
  const viaAtolPay = onlinePayment && !refundedManually;

  return (
    <div className="flex flex-wrap items-center gap-1.5 [&_button]:whitespace-nowrap">
      {canManage && status === "PENDING" ? (
        <>
          <Button
            size="sm"
            loading={busy === "confirm"}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            onClick={openConfirm}
          >
            Оплачен
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "cancel"}
            icon={<XCircle className="h-3.5 w-3.5" />}
            onClick={() => run("cancel")}
          >
            Отменить
          </Button>
        </>
      ) : null}
      {canManage && (needsReceipt || needsRefundReceipt) ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "fiscalize"}
          icon={<Receipt className="h-3.5 w-3.5" />}
          onClick={() => run("fiscalize")}
        >
          {refunded ? "Пробить чек возврата" : "Пробить чек"}
        </Button>
      ) : null}
      {canManage && waitingReceipt ? (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "refresh-receipt"}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => run("refresh-receipt")}
        >
          Обновить
        </Button>
      ) : null}
      {canManage && paid && canRefund ? (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "refund"}
          icon={<Undo2 className="h-3.5 w-3.5" />}
          onClick={openRefund}
        >
          {refundStatus === "fail" ? "Повторить возврат" : "Вернуть средства"}
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          size="sm"
          variant="ghostDanger"
          className="px-2.5"
          aria-label="Удалить запись о платеже"
          title="Удалить запись о платеже"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => setDeleteOpen(true)}
        />
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Отметить счёт оплаченным"
        description="Для денег, которые пришли мимо онлайн-оплаты: наличными, переводом или взаимозачётом. Чек в налоговую не отправляется."
      >
        <div className="space-y-3">
          <MoneyInput
            label="Оплаченная сумма, ₽"
            value={paidAmount}
            onChange={setPaidAmount}
            hint={`Счёт выставлен на ${amountLabel}. Можно указать любую сумму, в том числе 0.`}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button loading={busy === "confirm"} icon={<CheckCircle2 className="h-4 w-4" />} onClick={confirmPaid}>
            Отметить оплаченным
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Удалить платёж на ${amountLabel}?`}
        description="Запись пропадёт из раздела «Платежи», из финансов по дилерам и из кабинета дилера. Отменить удаление нельзя."
      >
        <div className="space-y-3 text-sm text-ink-muted">
          {paid || refunded ? (
            <p className="rounded-panel border border-hairline p-4">
              {receiptStatus === "done"
                ? `Платёж ${paid ? "оплачен" : "возвращён"}: чеки уже переданы в ОФД и налоговую и там останутся. `
                : `Платёж ${paid ? "оплачен" : "возвращён"}. `}
              Лицензия останется у дилера, но без счёта.
            </p>
          ) : provider === "atol_pay" && status === "PENDING" ? (
            <p>Перед удалением портал сверит счёт с АТОЛ Pay: если оплата уже поступила, удалить его не получится.</p>
          ) : null}
          <p>В журнал действий запишется, кто и когда удалил платёж.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" loading={deleting} icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
            Удалить
          </Button>
        </div>
      </Modal>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title={`Вернуть ${amountLabel}`}
        description={
          viaAtolPay
            ? "АТОЛ Pay вернёт деньги туда, откуда платили (по СБП — на счёт плательщика). Обычно они приходят за несколько дней."
            : paidManually
              ? "Оплату отметил администратор, через АТОЛ Pay деньги не проходили. Если дилер действительно платил, верните деньги сами — портал только отметит возврат."
              : "Верните деньги дилеру сами, например переводом по реквизитам. Портал только отметит возврат."
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            {receiptStatus === "done"
              ? "По пробитому чеку прихода касса пробьёт чек «Возврат прихода». "
              : "Чека прихода по платежу нет, поэтому чек возврата не пробивается. "}
            Лицензия по этому счёту будет аннулирована, а дилер и администраторы получат уведомление.
          </p>
          {onlinePayment ? (
            <div className="rounded-panel border border-hairline p-4">
              <Checkbox
                checked={refundedManually}
                onChange={setRefundedManually}
                label="Деньги уже вернули мимо АТОЛ Pay"
                description="АТОЛ Pay не трогаем — только отмечаем возврат и пробиваем чек."
              />
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRefundOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={busy === "refund"}
            icon={<Undo2 className="h-4 w-4" />}
            onClick={() => run("refund", { manual: !viaAtolPay })}
          >
            {viaAtolPay ? "Вернуть через АТОЛ Pay" : "Отметить возврат"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
