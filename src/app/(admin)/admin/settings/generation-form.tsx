"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, X, Ban, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Toggle } from "@/components/ui/toggle";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { usePermissions } from "@/hooks/use-permissions";
import { formatRuDateTime, parseMoscowLocal } from "@/lib/dates";
import { checkCustomVersion, compareVersions, type GenerationSettings } from "@/lib/site-settings";

/** Что запрет с такими настройками делает прямо сейчас — та же логика, что у проверки при генерации. */
function blackoutState(enabled: boolean, start: string, end: string) {
  if (!enabled) return { tone: "muted" as const, text: "Запрет выключен" };
  const now = Date.now();
  const from = parseMoscowLocal(start);
  const to = parseMoscowLocal(end);
  if (from && now < from.getTime()) {
    return { tone: "warning" as const, text: `Запрет начнётся ${formatRuDateTime(from)} МСК` };
  }
  if (to && now > to.getTime()) {
    return { tone: "muted" as const, text: `Период запрета закончился ${formatRuDateTime(to)} МСК` };
  }
  return {
    tone: "danger" as const,
    text: to ? `Запрет действует до ${formatRuDateTime(to)} МСК` : "Запрет действует, пока включён тумблер",
  };
}

export function GenerationForm({ initial }: { initial: GenerationSettings }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [blackoutEnabled, setBlackoutEnabled] = React.useState(initial.blackoutEnabled);
  const [blackoutStart, setBlackoutStart] = React.useState(initial.blackoutStart ?? "");
  const [blackoutEnd, setBlackoutEnd] = React.useState(initial.blackoutEnd ?? "");
  const [blackoutMessage, setBlackoutMessage] = React.useState(initial.blackoutMessage ?? "");
  const [versions, setVersions] = React.useState<string[]>(initial.blockedCustomVersions ?? []);
  const [versionInput, setVersionInput] = React.useState("");
  const [minVersion, setMinVersion] = React.useState(initial.minCustomVersion ?? "");
  const [probeVersion, setProbeVersion] = React.useState("");
  const [customVersionMessage, setCustomVersionMessage] = React.useState(initial.customVersionMessage ?? "");
  const [repeatPaid, setRepeatPaid] = React.useState(initial.repeatGenerationPaid === true);
  const [saving, setSaving] = React.useState(false);

  const probe = React.useMemo(() => {
    const v = probeVersion.trim();
    if (!v) return null;
    return checkCustomVersion(
      {
        ...initial,
        blockedCustomVersions: versions,
        minCustomVersion: minVersion.trim() || null,
        customVersionMessage: "",
      },
      v,
    );
  }, [probeVersion, versions, minVersion, initial]);

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
    if (minVersion.trim() && compareVersions(minVersion, minVersion) === null) {
      toast.error("Минимальная версия должна содержать цифры, например 5.5.0");
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
        minCustomVersion: minVersion.trim() || null,
        customVersionMessage: customVersionMessage.trim(),
        repeatGenerationPaid: repeatPaid,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Сохранено");
    router.refresh();
  }

  const state = blackoutState(blackoutEnabled, blackoutStart, blackoutEnd);

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
          <Tag tone={state.tone}>{state.text}</Tag>
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
          Версия кастома берётся из device_id.bin. Генерация запрещается, если версия входит в
          список ниже или младше минимальной. Запрет действует на всех, включая администраторов.
        </p>
        <Input
          label="Запретить версии ниже"
          value={minVersion}
          disabled={!canEdit}
          onChange={(e) => setMinVersion(e.target.value)}
          placeholder="Например: 5.5.0"
          hint={
            minVersion.trim()
              ? `Версии младше ${minVersion.trim()} не генерируются; ${minVersion.trim()} и новее — можно.`
              : "Пусто — нижней границы нет, действует только список."
          }
        />
        <div className="mt-5 text-[12.5px] text-ink-muted">Отдельные запрещённые версии</div>
        <div className="mt-1.5 flex items-end gap-2">
          <div className="flex-1">
            <Input
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
            hint="Пусто — в сообщении будет указана версия ШГУ и правило запрета."
          />
        </div>
        <div className="mt-5 rounded-panel border border-hairline p-4">
          <Input
            label="Проверить версию"
            value={probeVersion}
            onChange={(e) => setProbeVersion(e.target.value)}
            placeholder="Например: 5.2.5"
            hint="Проверка по введённым выше значениям, ещё до сохранения."
          />
          {probe ? (
            <div className="mt-2">
              {probe.blocked ? (
                <Tag tone="danger">
                  Генерация запрещена: {probe.rule === "list" ? "версия в списке" : `ниже ${minVersion.trim()}`}
                </Tag>
              ) : (
                <Tag tone="success">Генерация разрешена</Tag>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Repeat className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Повторная генерация</div>
        </div>
        <p className="text-sm text-ink-muted mb-4">
          Повторная — генерация для ШГУ, на который лицензия уже выдавалась (по данным DRIVEMODS
          или портала). По умолчанию она бесплатна: без счёта и без места в лимите.
        </p>
        <Toggle
          checked={repeatPaid}
          onChange={setRepeatPaid}
          disabled={!canEdit}
          label="Повторные генерации платные"
        />
        <p className="mt-3 text-xs text-ink-muted">
          {repeatPaid
            ? "Повторная генерация оплачивается по цене позиции из справочника и занимает место в лимите, как новая."
            : "Повторная генерация бесплатна."}
        </p>
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
