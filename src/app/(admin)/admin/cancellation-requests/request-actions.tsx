"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

export function RequestActions({
  id,
  status,
  licenseActive,
}: {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** Одобрить можно, только пока лицензию есть что аннулировать. */
  licenseActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | "delete" | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function send(action: "approve" | "reject", reviewNote?: string) {
    setBusy(action);
    const res = await fetch(`/api/cancellation-requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: reviewNote ?? null }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success(action === "approve" ? "Заявка одобрена, лицензия аннулирована" : "Заявка отклонена");
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

  const canApprove = status === "PENDING" || (status === "REJECTED" && licenseActive);

  return (
    <div className="flex items-center gap-2">
      {canApprove ? (
        <Button
          size="sm"
          loading={busy === "approve"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          onClick={() => send("approve")}
        >
          Одобрить
        </Button>
      ) : null}
      {status === "PENDING" ? (
        <Button
          size="sm"
          variant="ghostDanger"
          icon={<XCircle className="h-4 w-4" />}
          onClick={() => setRejectOpen(true)}
        >
          Отклонить
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 className="h-4 w-4" />}
        onClick={() => setDeleteOpen(true)}
      >
        Удалить
      </Button>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Отклонить заявку"
        description="Представитель получит уведомление с вашим комментарием."
      >
        <Textarea
          label="Комментарий (необязательно)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Например: лицензия ещё активно используется..."
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={busy === "reject"}
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => send("reject", note)}
          >
            Отклонить заявку
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Удалить заявку?"
        description="Заявка исчезнет из списка. Лицензия не изменится, а в её истории останется запись об удалении."
      >
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={busy === "delete"}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={remove}
          >
            Удалить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
