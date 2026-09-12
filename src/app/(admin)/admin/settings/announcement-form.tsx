"use client";

import * as React from "react";
import { Save, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { usePermissions } from "@/hooks/use-permissions";
import type { Announcement } from "@/lib/site-settings";

export function AnnouncementForm({ initial }: { initial: Announcement }) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [text, setText] = React.useState(initial.text);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (enabled && !text.trim()) {
      toast.error("Введите текст объявления");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/announcement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, text: text.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Сохранено");
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <div className="font-display text-lg tracking-tight mb-1">Объявление под шапкой</div>
        <p className="text-sm text-ink-muted mb-4">
          Оранжевая полоса вверху кабинета: новости, важные обновления или предупреждение о
          технических работах. Пользователь может её закрыть; при изменении текста она покажется снова.
        </p>
        <div className="space-y-4">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            disabled={!canEdit}
            label="Показывать объявление"
            description="Полоса появится у всех представителей и администраторов."
          />
          <Textarea
            label="Текст объявления"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={!canEdit}
            placeholder="Например: 12 сентября с 02:00 до 04:00 МСК плановые технические работы."
          />
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            loading={saving}
            disabled={!canEdit}
            title={canEdit ? undefined : "Нет права на редактирование настроек"}
            icon={<Save className="h-4 w-4" />}
            onClick={save}
          >
            Сохранить
          </Button>
        </div>
      </Card>

      <Card>
        <div className="text-xs uppercase tracking-widest text-ink-muted mb-3">Предпросмотр</div>
        {text.trim() ? (
          <div className="rounded-panel border border-[#f5b544] bg-[#fff4e0] text-[#8a5200] px-4 py-2.5 flex items-center gap-3">
            <Megaphone className="h-4 w-4 shrink-0" />
            <p className="text-[13px] leading-snug">{text}</p>
          </div>
        ) : (
          <div className="rounded-panel border border-dashed border-hairline px-4 py-6 text-center text-sm text-ink-subtle">
            Введите текст, чтобы увидеть предпросмотр
          </div>
        )}
        {!enabled ? (
          <p className="mt-3 text-xs text-ink-subtle">
            Объявление выключено — полоса не показывается, даже если текст заполнен.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
