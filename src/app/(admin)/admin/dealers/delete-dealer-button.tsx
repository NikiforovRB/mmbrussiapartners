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
 * Вместе с дилером удаляется всё, что на нём числится. Если обычному
 * удалению что-то мешает (чек в кассе, возврат, несверенная оплата),
 * предлагается принудительное.
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
  /** Отказ обычного удаления, пришедший уже при попытке удалить. */
  const [refusal, setRefusal] = React.useState<string | null>(null);

  async function openModal() {
    setOpen(true);
    setSummary(null);
    setLoadError(null);
    setConfirmed(false);
    setRefusal(null);
    const res = await fetch(`/api/dealers/${dealerId}/delete-summary`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(j.error ?? "Не удалось проверить, что удалится вместе с дилером");
      return;
    }
    setSummary(j as Summary);
  }

  const hasData = (summary?.items.length ?? 0) > 0;
  const blockers = summary?.blockers ?? [];
  const forced = blockers.length > 0 || refusal !== null;
  const ready = summary !== null && (confirmed || (!hasData && !forced));

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/dealers/${dealerId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true, ignoreBlockers: forced }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const message = j.error ?? "Не удалось удалить дилера";
      if (res.status === 409 && !forced) {
        setRefusal(message);
        setConfirmed(false);
        return;
      }
      toast.error(message);
      return;
    }
    setOpen(false);
    toast.success("Дилер удалён");
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
              {forced ? "Удалить принудительно" : hasData ? "Удалить всё" : "Удалить"}
            </Button>
          </>
        }
      >
        {loadError ? (
          <div className="text-sm text-danger">{loadError}</div>
        ) : !summary ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Проверяем, что числится за дилером, и сверяем чеки с кассой…
          </div>
        ) : (
          <div className="space-y-3">
            {forced ? (
              <div className="rounded-panel border border-warning/40 bg-soft-warning p-3 text-sm">
                <div className="font-medium">Обычное удаление недоступно</div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {refusal ? <li>{refusal}</li> : blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <div className="mt-2 text-xs text-ink-muted">
                  Принудительное удаление этого не остановит: касса и АТОЛ Pay доведут начатое сами — чек будет
                  пробит, возврат завершится. Но в кабинете записей об этом уже не останется.
                </div>
              </div>
            ) : null}
            {hasData ? (
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
            ) : !forced ? (
              <div className="text-sm text-ink-muted">Лицензий, платежей и записей в журналах у дилера нет.</div>
            ) : null}
            {hasData || forced ? (
              <Checkbox
                checked={confirmed}
                onChange={setConfirmed}
                label={
                  forced
                    ? "Удалить принудительно: понимаю, что всё это пропадёт без возможности восстановления"
                    : "Понимаю, что всё это будет удалено без возможности восстановления"
                }
              />
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
