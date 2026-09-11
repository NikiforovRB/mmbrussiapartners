"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Receipt, RefreshCw, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";

type Action = "confirm" | "cancel" | "fiscalize" | "refresh-receipt" | "refund";

export function PaymentActions({
  id,
  status,
  receiptStatus,
}: {
  id: string;
  status: string;
  receiptStatus: string | null;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("payments.manage");
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);

  async function run(action: Action) {
    setBusy(action);
    const res = await fetch(`/api/payments/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Не удалось выполнить действие");
      return;
    }
    toast.success(
      action === "confirm"
        ? "Оплата подтверждена, чек отправлен в кассу"
        : action === "cancel"
          ? "Платёж отменён"
          : action === "refund"
            ? "Возврат средств зафиксирован"
            : "Статус чека обновлён",
    );
    setRefundOpen(false);
    router.refresh();
  }

  if (!canManage) return null;

  const paid = status === "PAID";
  const needsReceipt = paid && receiptStatus !== "done";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "PENDING" ? (
        <>
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
      {needsReceipt ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "fiscalize"}
          icon={<Receipt className="h-3.5 w-3.5" />}
          onClick={() => run("fiscalize")}
        >
          Пробить чек
        </Button>
      ) : null}
      {paid && receiptStatus === "wait" ? (
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
      {paid ? (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "refund"}
          icon={<Undo2 className="h-3.5 w-3.5" />}
          onClick={() => setRefundOpen(true)}
        >
          Вернуть средства
        </Button>
      ) : null}

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Вернуть средства"
        description="Деньги возвращаются вручную (в банке/эквайринге). В портале платёж получит статус «Возвращён», дилер получит уведомление. Обычно применяется при аннулировании лицензии."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRefundOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={busy === "refund"}
            icon={<Undo2 className="h-4 w-4" />}
            onClick={() => run("refund")}
          >
            Подтвердить возврат
          </Button>
        </div>
      </Modal>
    </div>
  );
}
