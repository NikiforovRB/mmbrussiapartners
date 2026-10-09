"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";

type Summary = { items: string[]; legacyRecords: number; paidPayments: number; blockers: string[] };

/**
 * Удаление дилера с подтверждением. В списке — иконка, в карточке —
 * кнопка с подписью; после удаления из карточки уходим обратно к списку.
 * Вместе с дилером удаляется всё, что на нём числится.
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
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);

  async function openModal() {
    setOpen(true);
    setSummary(null);
    setLoadError(null);
    setConfirmed(false);
    const res = await fetch(`/api/dealers/${dealerId}/delete-summary`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(j.error ?? "Не удалось проверить, что удалится вместе с дилером");
      return;
    }
    setSummary(j as Summary);
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/dealers/${dealerId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить дилера");
      return;
    }
    setOpen(false);
    toast.success("Дилер удалён");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  const hasData = (summary?.items.length ?? 0) > 0;
  const blocked = (summary?.blockers.length ?? 0) > 0;
  const ready = summary !== null && !blocked && (!hasData || confirmed);

  return (
    <>
      {compact ? (
        <Button
          size="sm"
          variant="ghostDanger"
          className="w-9 px-0"
          aria-label={`Удалить дилера ${name}`}
          title="Удалить"
          onClick={openModal}
          icon={<Trash2 className="h-4 w-4" />}
        />
      ) : (
        <Button variant="ghostDanger" icon={<Trash2 className="h-4 w-4" />} onClick={openModal}>
          Удалить
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Удалить дилера?"
        description={
          <>
            <span className="text-ink">{name}</span> будет удалён вместе с профилем, уведомлениями и
            индивидуальными ценами. Восстановить его будет нельзя.
          </>
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!ready}
              icon={<Trash2 className="h-4 w-4" />}
              onClick={remove}
            >
              {hasData ? "Удалить всё" : "Удалить"}
            </Button>
          </>
        }
      >
        {loadError ? (
          <div className="text-sm text-danger">{loadError}</div>
        ) : !summary ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Проверяем, что числится за дилером…
          </div>
        ) : blocked ? (
          <div className="rounded-panel border border-danger/30 bg-danger/5 p-3 text-sm">
            Сейчас удалить нельзя: {summary.blockers.join("; ")}.
          </div>
        ) : hasData ? (
          <div className="space-y-3">
            <div className="rounded-panel border border-danger/30 bg-danger/5 p-3 text-sm">
              <div className="font-medium">Вместе с ним удалятся:</div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {summary.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-ink-muted">
                Эти данные пропадут из отчётов.
                {summary.paidPayments > 0 ? " Пробитые чеки в налоговой останутся — их это не отменяет." : ""}
                {summary.legacyRecords > 0
                  ? ` Записи старого ЛК DriveMods (${summary.legacyRecords}) останутся без владельца.`
                  : ""}
              </div>
            </div>
            <Checkbox
              checked={confirmed}
              onChange={setConfirmed}
              label="Понимаю, что всё это будет удалено без возможности восстановления"
            />
          </div>
        ) : (
          <div className="text-sm text-ink-muted">Лицензий, платежей и записей в журналах у дилера нет.</div>
        )}
      </Modal>
    </>
  );
}
