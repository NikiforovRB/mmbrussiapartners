"use client";

import * as React from "react";
import { Save, Plus, X, Ban } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { usePermissions } from "@/hooks/use-permissions";
import { parseMoscowLocal } from "@/lib/dates";
import type { GenerationSettings } from "@/lib/site-settings";

export function GenerationForm({ initial }: { initial: GenerationSettings }) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [blackoutEnabled, setBlackoutEnabled] = React.useState(initial.blackoutEnabled);
  const [blackoutStart, setBlackoutStart] = React.useState(initial.blackoutStart ?? "");
  const [blackoutEnd, setBlackoutEnd] = React.useState(initial.blackoutEnd ?? "");
  const [blackoutMessage, setBlackoutMessage] = React.useState(initial.blackoutMessage ?? "");
  const [versions, setVersions] = React.useState<string[]>(initial.blockedCustomVersions ?? []);
  const [versionInput, setVersionInput] = React.useState("");
  const [customVersionMessage, setCustomVersionMessage] = React.useState(initial.customVersionMessage ?? "");
  const [saving, setSaving] = React.useState(false);

  function addVersion() {
    const v = versionInput.trim();
    if (!v) return;
    if (!versions.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setVersions((prev) => [...prev, v]);
    }
    setVersionInput("");
  }
  function removeVersion(v: string) {
    setVersions((prev) => prev.filter((x) => x !== v));
  }

  async function save() {
    const start = parseMoscowLocal(blackoutStart);
    const end = parseMoscowLocal(blackoutEnd);
    if (start && end && end <= start) {
      toast.error("Окончание запрета должно быть позже начала");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/generation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blackoutEnabled,
        blackoutStart: blackoutStart || null,
        blackoutEnd: blackoutEnd || null,
        blackoutMessage: blackoutMessage.trim(),
        blockedCustomVersions: versions,
        customVersionMessage: customVersionMessage.trim(),
      }),
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
        <div className="flex items-center gap-2 mb-1">
          <Ban className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Запрет генерации на период</div>
        </div>
        <p className="text-sm text-ink-muted mb-4">
          В указанный интервал представители не смогут генерировать лицензии (техработы,
          стоп-продажи). Администраторы ограничение обходят. Оставьте даты пустыми — запрет
          действует, пока включён тумблер.
        </p>
        <div className="space-y-4">
          <Toggle
            checked={blackoutEnabled}
            onChange={setBlackoutEnabled}
            disabled={!canEdit}
            label="Запрет генерации включён"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <DateTimePicker
              label="Начало"
              value={blackoutStart}
              disabled={!canEdit}
              onChange={setBlackoutStart}
            />
            <DateTimePicker
              label="Окончание"
              value={blackoutEnd}
              disabled={!canEdit}
              onChange={setBlackoutEnd}
            />
          </div>
          <Textarea
            label="Сообщение для представителя"
            value={blackoutMessage}
            disabled={!canEdit}
            onChange={(e) => setBlackoutMessage(e.target.value)}
            rows={2}
            placeholder="Например: Идут технические работы, генерация недоступна до 04:00 МСК."
          />
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg tracking-tight mb-1">Устаревшие версии кастома</div>
        <p className="text-sm text-ink-muted mb-4">
          Генерация запрещается, если версия кастома из device_id.bin входит в этот список.
          Добавляйте сюда устаревшие версии по мере выхода обновлений.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Версия кастома"
              value={versionInput}
              disabled={!canEdit}
              onChange={(e) => setVersionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVersion();
                }
              }}
              placeholder="Например: 1.2.3"
            />
          </div>
          <Button variant="secondary" disabled={!canEdit} icon={<Plus className="h-4 w-4" />} onClick={addVersion}>
            Добавить
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {versions.length === 0 ? (
            <span className="text-sm text-ink-subtle">Список пуст</span>
          ) : (
            versions.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 rounded-btn border border-hairline bg-surface-muted px-3 h-9 text-sm"
              >
                {v}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeVersion(v)}
                    className="text-ink-subtle hover:text-danger"
                    aria-label={`Убрать ${v}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        <div className="mt-4">
          <Textarea
            label="Сообщение при устаревшей версии"
            value={customVersionMessage}
            disabled={!canEdit}
            onChange={(e) => setCustomVersionMessage(e.target.value)}
            rows={2}
            placeholder="Например: Версия кастома устарела — обновите кастом и повторите генерацию."
          />
        </div>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
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
    </div>
  );
}
