"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, EyeOff, RefreshCw, XCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { formatRuDateTime } from "@/lib/dates";
import { usePermissions } from "@/hooks/use-permissions";
import {
  SITE_PROBLEM_STATUSES,
  SITE_RESULT_LABEL,
  formatSiteSummary,
  type SitePublication,
} from "@/lib/site-sync-labels";

export type SitePublicationInfo = {
  status: SitePublication;
  at: string | null;
  note: string | null;
  consent: boolean;
  syncedAt: string | null;
  syncStatus: string | null;
  syncMessage: string | null;
};

/** Сохранённые в БД значения — именно они уйдут на сайт. */
export type SitePreview = {
  phone: string;
  city: string | null;
  country: string | null;
  siteComment: string | null;
};

type Outcome = {
  ok: boolean;
  error: string | null;
  summary: Record<string, number> | null;
  results: { status: string; message?: string | null }[];
  warnings: string[];
} | null;

export function SitePublicationCard({
  dealerId,
  accountStatus,
  publication,
  preview,
  integrationEnabled,
}: {
  dealerId: string;
  accountStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  publication: SitePublicationInfo;
  preview: SitePreview;
  integrationEnabled: boolean;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canModerate = can("dealers.approve");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  const { status, consent } = publication;
  const approved = status === "APPROVED" && consent;
  const live = approved && accountStatus === "APPROVED";
  const pending = status === "PENDING" && consent;

  async function act(action: "approve" | "reject" | "resync", body: Record<string, unknown> = {}) {
    setBusy(action);
    const res = await fetch(`/api/dealers/${dealerId}/site-publication`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    setBusy(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Ошибка");
      return null;
    }
    return j as { live?: boolean; outcome?: Outcome };
  }

  // Сайт получает изменения в фоне, уже после ответа (до 30 с): обновляем карточку, пока не придёт его ответ.
  const [awaiting, setAwaiting] = React.useState<{ syncedAt: string | null; tries: number } | null>(null);
  React.useEffect(() => {
    if (!awaiting) return;
    if (publication.syncedAt !== awaiting.syncedAt || awaiting.tries >= 20) {
      setAwaiting(null);
      return;
    }
    const timer = window.setTimeout(() => {
      router.refresh();
      setAwaiting((a) => (a ? { ...a, tries: a.tries + 1 } : a));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [awaiting, publication.syncedAt, router]);

  function refreshWithSiteResult(expectSend: boolean) {
    router.refresh();
    if (expectSend) setAwaiting({ syncedAt: publication.syncedAt, tries: 0 });
  }

  async function approve() {
    const j = await act("approve");
    if (!j) return;
    toast.success(
      j.live
        ? "Публикация одобрена, телефон отправляется на сайт"
        : "Публикация одобрена. Телефон появится на сайте, когда учётная запись станет активной",
    );
    refreshWithSiteResult(Boolean(j.live));
  }

  async function reject() {
    const j = await act("reject", { note: note.trim() || null });
    if (!j) return;
    toast.success(approved ? "Телефон снимается с сайта" : "Заявка отклонена");
    setRejectOpen(false);
    setNote("");
    refreshWithSiteResult(approved || publication.syncStatus === "failed");
  }

  async function resync() {
    const j = await act("resync");
    if (!j) return;
    const o = j.outcome;
    if (!o) toast.info("Отправлять нечего: телефон не опубликован и на сайте его нет");
    else if (!o.ok) toast.error(o.error ?? "Сайт не принял запрос");
    else {
      const problem = o.results.find((r) => r.status === "conflict" || r.status === "error");
      if (problem) toast.error(problem.message ?? SITE_RESULT_LABEL[problem.status]);
      else toast.success(`Сайт ответил: ${formatSiteSummary(o.summary) || "ок"}`);
    }
    router.refresh();
  }

  const statusTag = live ? (
    <Tag tone="success">На сайте</Tag>
  ) : approved ? (
    <Tag tone="muted">Одобрено, учётная запись не активна</Tag>
  ) : pending ? (
    <Tag tone="warning">Заявка на рассмотрении</Tag>
  ) : status === "REJECTED" && consent ? (
    <Tag tone="danger">Отклонено</Tag>
  ) : (
    <Tag tone="muted">Не публикуется</Tag>
  );

  const syncProblem = publication.syncStatus && SITE_PROBLEM_STATUSES.includes(publication.syncStatus);

  return (
    <Card>
      <div className="font-display text-lg  tracking-tight mb-3">Публикация на сайте</div>
      <div className="flex flex-wrap items-center gap-2">{statusTag}</div>
      <div className="mt-2 text-xs text-ink-muted space-y-1">
        {pending && publication.at ? <div>Заявка от {formatRuDateTime(publication.at)}</div> : null}
        {!pending && status !== "NONE" && publication.at ? (
          <div>Решение от {formatRuDateTime(publication.at)}</div>
        ) : null}
        {status === "REJECTED" && publication.note ? <div>Причина: {publication.note}</div> : null}
        {!consent && status === "NONE" ? (
          <div>Представитель не включал «Показывать телефон на сайте».</div>
        ) : null}
      </div>

      <div className="mt-4 rounded-panel border border-hairline p-3 text-xs space-y-1">
        <div className="text-ink-subtle uppercase tracking-tight text-[11px] mb-1">На сайте будет</div>
        <div>
          <span className="text-ink-muted">Город: </span>
          {preview.city?.trim() ? (
            <>
              {preview.city} <span className="text-ink-muted">({preview.country?.trim() || "Россия"})</span>
            </>
          ) : (
            <span className="text-danger">не указан</span>
          )}
        </div>
        <div>
          <span className="text-ink-muted">Телефон: </span>
          {preview.phone || <span className="text-danger">не указан</span>}
        </div>
        <div>
          <span className="text-ink-muted">Подпись: </span>
          {preview.siteComment?.trim() || "—"}
        </div>
      </div>

      {publication.syncedAt ? (
        <div className={`mt-3 text-xs ${syncProblem ? "text-danger" : "text-ink-muted"}`}>
          Сайт: {SITE_RESULT_LABEL[publication.syncStatus ?? ""] ?? publication.syncStatus},{" "}
          {formatRuDateTime(publication.syncedAt)}
          {publication.syncMessage ? <div className="mt-0.5">{publication.syncMessage}</div> : null}
        </div>
      ) : null}
      {!integrationEnabled ? (
        <div className="mt-3 text-xs text-danger">
          Интеграция с сайтом не настроена: изменения сохраняются, но на mmbrussia.ru не уходят.
        </div>
      ) : null}

      {canModerate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {pending ? (
            <>
              <Button size="sm" loading={busy === "approve"} onClick={approve} icon={<CheckCircle2 className="h-4 w-4" />}>
                Одобрить
              </Button>
              <Button size="sm" variant="ghostDanger" onClick={() => setRejectOpen(true)} icon={<XCircle className="h-4 w-4" />}>
                Отклонить
              </Button>
            </>
          ) : approved ? (
            <>
              <Button size="sm" variant="ghostDanger" onClick={() => setRejectOpen(true)} icon={<EyeOff className="h-4 w-4" />}>
                Снять с сайта
              </Button>
              {integrationEnabled ? (
                <Button size="sm" variant="ghost" loading={busy === "resync"} onClick={resync} icon={<RefreshCw className="h-4 w-4" />}>
                  Отправить заново
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "approve"}
              onClick={approve}
              icon={<Globe className="h-4 w-4" />}
              title="Включает публикацию от имени представителя — например, если его телефон уже есть на сайте"
            >
              Опубликовать
            </Button>
          )}
        </div>
      ) : null}

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={approved ? "Снять телефон с сайта" : "Отклонить заявку"}
        description={
          approved
            ? "Телефон исчезнет с сайта сразу. Представитель увидит причину в профиле."
            : "Представитель увидит причину в профиле."
        }
      >
        <Textarea
          label="Причина (необязательно)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" loading={busy === "reject"} onClick={reject} icon={<XCircle className="h-4 w-4" />}>
            {approved ? "Снять с сайта" : "Отклонить"}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
