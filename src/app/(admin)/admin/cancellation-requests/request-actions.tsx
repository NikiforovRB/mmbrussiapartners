"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

export function RequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
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

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        loading={busy === "approve"}
        icon={<CheckCircle2 className="h-4 w-4" />}
        onClick={() => send("approve")}
      >
        Одобрить
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<XCircle className="h-4 w-4" />}
        onClick={() => setRejectOpen(true)}
      >
        Отклонить
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
    </div>
  );
}
