"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

export function DriveModsAccessCard({
  access,
  requestedAt,
  requirements,
}: {
  access: boolean;
  requestedAt: string | null;
  requirements: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [requested, setRequested] = React.useState(Boolean(requestedAt));

  async function request() {
    setLoading(true);
    const res = await fetch("/api/profile/drivemods-request", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось отправить заявку");
      return;
    }
    toast.success("Заявка отправлена");
    setRequested(true);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="h-5 w-5 text-accent" />
        <div className="font-display text-lg tracking-tight">Личный кабинет DriveMods</div>
      </div>
      {access ? (
        <div className="flex items-center gap-2 text-sm">
          <Tag tone="success">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Доступ подключён
            </span>
          </Tag>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Часть типов лицензий выдаётся и оплачивается только в отдельном личном кабинете
            DriveMods. Если он вам нужен — отправьте заявку, администратор подключит доступ.
          </p>
          {requirements.trim() ? (
            <div className="mt-3 rounded-panel border border-hairline p-3 text-sm text-ink-muted whitespace-pre-line">
              <div className="text-xs uppercase tracking-widest text-ink-subtle mb-1.5">
                Требования для доступа
              </div>
              {requirements}
            </div>
          ) : null}
          <div className="mt-4">
            {requested ? (
              <Tag tone="warning">Заявка на рассмотрении</Tag>
            ) : (
              <Button loading={loading} icon={<Send className="h-4 w-4" />} onClick={request}>
                Запросить доступ
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
