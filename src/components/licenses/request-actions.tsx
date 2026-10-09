"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { usePermissions } from "@/hooks/use-permissions";
import { formatRub } from "@/lib/money";

export type RequestPaymentInfo = {
  /** Счёт оплачен — по заявке на возврат вернутся деньги. */
  paid: boolean;
  amount: number | null;
  /** Оплата прошла через АТОЛ Pay — деньги вернутся автоматически. */
  online: boolean;
};

export function RequestActions({
  id,
  status,
  kind = "CANCEL",
  licenseActive,
  payment = null,
  allowDelete = true,
}: {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  kind?: "CANCEL" | "REFUND";
  /** Одобрить можно, только пока лицензию есть что аннулировать. */
  licenseActive: boolean;
  payment?: RequestPaymentInfo | null;
  allowDelete?: boolean;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [busy, setBusy] = React.useState<"approve" | "reject" | "delete" | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [manualRefund, setManualRefund] = React.useState(false);

  const isRefund = kind === "REFUND";
  const refundsMoney = isRefund && payment?.paid === true;
  const canRefund = can("payments.refund");

  async function send(action: "approve" | "reject") {
    setBusy(action);
    const res = await fetch(`/api/cancellation-requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        note: note.trim() || null,
        ...(refundsMoney ? { manualRefund } : {}),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success(
      action === "reject"
        ? "Заявка отклонена, дилер получит уведомление"
        : refundsMoney
          ? "Возврат оформлен, лицензия аннулирована"
          : "Заявка одобрена, лицензия аннулирована",
    );
    setApproveOpen(false);
    setRejectOpen(false);
    setNote("");
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    const res = await fetch(`/api/cancellation-requests/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить заявку");
      return;
    }
    toast.success("Заявка удалена");
    setDeleteOpen(false);
    router.refresh();
  }

  const canApprove = status === "PENDING" || (status === "REJECTED" && (licenseActive || refundsMoney));
  const amountLabel = payment?.amount != null ? formatRub(payment.amount) : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApprove ? (
        <Button
          size="sm"
          disabled={refundsMoney && !canRefund}
          title={refundsMoney && !canRefund ? "Нет права «Возвраты по платежам»" : undefined}
          icon={refundsMoney ? <Undo2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          onClick={() => {
            setNote("");
            setManualRefund(false);
            setApproveOpen(true);
          }}
        >
          {refundsMoney ? "Одобрить и вернуть" : "Одобрить"}
        </Button>
      ) : null}
      {status === "PENDING" ? (
        <Button
          size="sm"
          variant="ghostDanger"
          icon={<XCircle className="h-4 w-4" />}
          onClick={() => {
            setNote("");
            setRejectOpen(true);
          }}
        >
          Отказать
        </Button>
      ) : null}
      {allowDelete ? (
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
          Удалить
        </Button>
      ) : null}

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={refundsMoney ? `Вернуть ${amountLabel} и аннулировать лицензию?` : "Одобрить заявку?"}
        description={
          refundsMoney
            ? payment?.online && !manualRefund
              ? "АТОЛ Pay вернёт деньги туда, откуда платил дилер. Лицензия будет аннулирована."
              : "Возврат будет отмечен вручную: деньги верните сами, мимо АТОЛ Pay. Лицензия будет аннулирована."
            : isRefund
              ? "Лицензия не оплачена: её аннулируем, а счёт по ней отменим — платить не придётся."
              : "Лицензия будет аннулирована. Неоплаченный счёт по ней отменится."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setApproveOpen(false)}>
              Отмена
            </Button>
            <Button
              variant={refundsMoney ? "danger" : "primary"}
              loading={busy === "approve"}
              icon={refundsMoney ? <Undo2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              onClick={() => send("approve")}
            >
              {refundsMoney ? "Вернуть деньги" : "Одобрить"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {refundsMoney && payment?.online ? (
            <Toggle
              checked={manualRefund}
              onChange={setManualRefund}
              label="Деньги уже вернули сами"
              description="АТОЛ Pay не трогаем, возврат только отмечается на портале."
            />
          ) : null}
          <Textarea
            label="Комментарий для дилера (необязательно)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={isRefund ? "Отказать в возврате" : "Отказать в аннулировании"}
        description="Лицензия останется как есть. Дилер получит уведомление с вашим комментарием."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={busy === "reject"}
              icon={<XCircle className="h-4 w-4" />}
              onClick={() => send("reject")}
            >
              Отказать
            </Button>
          </>
        }
      >
        <Textarea
          label="Причина отказа (необязательно)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Например: лицензия уже активирована на устройстве клиента"
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Удалить заявку?"
        description="Заявка исчезнет из списка. Лицензия не изменится, а в её истории останется запись об удалении."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button variant="danger" loading={busy === "delete"} icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  );
}
