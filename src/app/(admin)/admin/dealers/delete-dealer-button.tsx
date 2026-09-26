"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Удаление представителя с подтверждением. В списке — иконка, в карточке —
 * кнопка с подписью; после удаления из карточки уходим обратно к списку.
 */
export function DeleteDealerButton({
  dealerId,
  name,
  compact = false,
  redirectTo,
}: {
  dealerId: string;
  name: string;
  compact?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/dealers/${dealerId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить представителя");
      return;
    }
    setOpen(false);
    toast.success("Представитель удалён");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      {compact ? (
        <Button
          size="sm"
          variant="ghostDanger"
          className="w-9 px-0"
          aria-label={`Удалить представителя ${name}`}
          title="Удалить"
          onClick={() => setOpen(true)}
          icon={<Trash2 className="h-4 w-4" />}
        />
      ) : (
        <Button variant="ghostDanger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Удалить
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Удалить представителя?"
        description={
          <>
            <span className="text-ink">{name}</span> будет удалён вместе с профилем, уведомлениями и
            индивидуальными ценами. Если у представителя уже есть лицензии или платежи, удалить его
            нельзя — заблокируйте его.
          </>
        }
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" loading={busy} icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
            Удалить
          </Button>
        </div>
      </Modal>
    </>
  );
}
