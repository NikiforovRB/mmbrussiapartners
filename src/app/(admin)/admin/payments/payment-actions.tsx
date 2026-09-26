"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Receipt, RefreshCw, SearchCheck, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";

type Action = "confirm" | "cancel" | "fiscalize" | "refresh-receipt" | "refund" | "sync";

export function PaymentActions({
  id,
  status,
  receiptStatus,
  provider,
  amountLabel,
  refundStatus,
  refundReceiptStatus,
}: {
  id: string;
  status: string;
  receiptStatus: string | null;
  provider: string;
  amountLabel: string;
  refundStatus: string | null;
  refundReceiptStatus: string | null;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("payments.manage");
  const canRefund = can("payments.refund");
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundedManually, setRefundedManually] = React.useState(false);

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
    if (action === "sync") {
      if (json.paid) toast.success("АТОЛ Pay подтвердил оплату, чек отправлен в кассу");
      else toast.info(`Оплата не поступила. АТОЛ Pay: ${json.statusMessage ?? "заказ не найден"}`);
      router.refresh();
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
          ? "Оплата подтверждена, чек отправлен в кассу"
          : action === "cancel"
            ? "Платёж отменён"
            : action === "fiscalize"
              ? "Чек отправлен в кассу"
              : "Статус чека обновлён",
      );
    }
    setRefundOpen(false);
    router.refresh();
  }

  function openRefund() {
    setRefundedManually(false);
    setRefundOpen(true);
  }

  if (!canManage) return null;

  const paid = status === "PAID";
  const refunded = status === "REFUNDED";
  const needsReceipt = paid && receiptStatus !== "done";
  // Возвраты, отмеченные до появления настоящих возвратов, чек не получают:
  // деньги по ним могли и не вернуть.
  const needsRefundReceipt =
    refunded && refundStatus === "done" && receiptStatus === "done" && !["done", "wait"].includes(refundReceiptStatus ?? "");
  const waitingReceipt = (paid && receiptStatus === "wait") || (refunded && refundReceiptStatus === "wait");
  const viaAtolPay = provider === "atol_pay" && !refundedManually;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "PENDING" ? (
        <>
          {provider === "atol_pay" ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "sync"}
              icon={<SearchCheck className="h-3.5 w-3.5" />}
              onClick={() => run("sync")}
            >
              Проверить оплату
            </Button>
          ) : null}
          <Button
            size="sm"
            loading={busy === "confirm"}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            onClick={() => run("confirm")}
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
      {needsReceipt || needsRefundReceipt ? (
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
      {waitingReceipt ? (
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
      {paid && canRefund ? (
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

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title={`Вернуть ${amountLabel}`}
        description={
          viaAtolPay
            ? "АТОЛ Pay вернёт деньги туда, откуда платили: на карту, через СБП или T-Pay. Обычно они приходят за несколько дней."
            : "Верните деньги дилеру сами, например переводом по реквизитам. Портал только отметит возврат."
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            По пробитому чеку прихода касса пробьёт чек «Возврат прихода». Дилер получит уведомление. Лицензия
            автоматически не аннулируется.
          </p>
          {provider === "atol_pay" ? (
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
