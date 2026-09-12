"use client";

import * as React from "react";
import { Save, Plus, Trash2, LifeBuoy, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { SupportLinkCard } from "@/components/support/support-channels";
import { SUPPORT_ICON_OPTIONS, type SupportChannel, type SupportSettings } from "@/lib/site-settings";

const EMPTY_CHANNEL: SupportChannel = {
  label: "",
  url: "",
  icon: "telegram",
  iconUrl: "",
  iconHoverUrl: "",
};

/** Поле иконки: загрузка своего файла (SVG/PNG) либо ссылка. */
function IconField({
  label,
  value,
  onChange,
  canEdit,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  canEdit: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/settings/support-icon", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось загрузить иконку");
      return;
    }
    const j = await res.json();
    onChange(j.url as string);
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-[12.5px] text-ink-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-panel border border-hairline bg-white overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-7 w-7 object-contain" />
          ) : (
            <span className="text-[11px] text-ink-subtle">нет</span>
          )}
        </span>
        <label
          className={`inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3 h-10 text-sm transition-colors ${
            canEdit ? "cursor-pointer hover:border-accent hover:text-accent" : "opacity-50 cursor-not-allowed"
          }`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {value ? "Заменить" : "Загрузить"}
          <input
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
            className="hidden"
            disabled={!canEdit}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        {value && canEdit ? (
          <button
            type="button"
            onClick={() => onChange("")}
            title="Убрать иконку"
            className="grid h-10 w-10 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SupportForm({ initial }: { initial: SupportSettings }) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [intro, setIntro] = React.useState(initial.intro ?? "");
  const [requirements, setRequirements] = React.useState(initial.requirements ?? "");
  const [channels, setChannels] = React.useState<SupportChannel[]>(initial.channels ?? []);
  const [saving, setSaving] = React.useState(false);

  function updateChannel(index: number, patch: Partial<SupportChannel>) {
    setChannels((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function addChannel() {
    setChannels((prev) => [...prev, { ...EMPTY_CHANNEL }]);
  }
  function removeChannel(index: number) {
    setChannels((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    for (const c of channels) {
      if (!c.label.trim() || !c.url.trim()) {
        toast.error("У каждого канала должны быть название и ссылка");
        return;
      }
    }
    setSaving(true);
    const res = await fetch("/api/settings/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intro: intro.trim(),
        requirements: requirements.trim(),
        channels: channels.map((c) => ({
          label: c.label.trim(),
          url: c.url.trim(),
          icon: c.icon || null,
          iconUrl: c.iconUrl?.trim() || null,
          iconHoverUrl: c.iconHoverUrl?.trim() || null,
        })),
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
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Техподдержка</div>
        </div>
        <p className="text-sm text-ink-muted mb-4">
          Каналы связи и ссылки для вступления в группы. Иконку можно выбрать из набора
          либо задать ссылками на картинки (обычную и при наведении).
        </p>

        <div className="space-y-3">
          <Textarea
            label="Вступительный текст (необязательно)"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={2}
            disabled={!canEdit}
            placeholder="Например: Мы на связи с 9:00 до 21:00 МСК."
          />
        </div>

        <div className="divider my-5" />

        <div className="space-y-4">
          {channels.length === 0 ? (
            <p className="text-sm text-ink-subtle">Каналы не добавлены.</p>
          ) : null}
          {channels.map((c, i) => (
            <div key={i} className="rounded-panel border border-hairline p-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label="Название"
                  value={c.label}
                  onChange={(e) => updateChannel(i, { label: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Наш Telegram"
                />
                <Input
                  label="Ссылка"
                  value={c.url}
                  onChange={(e) => updateChannel(i, { url: e.target.value })}
                  disabled={!canEdit}
                  placeholder="https://t.me/..."
                />
                <Select
                  label="Иконка из набора"
                  value={c.icon ?? "link"}
                  onChange={(v) => updateChannel(i, { icon: v })}
                  disabled={!canEdit}
                  options={SUPPORT_ICON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <IconField
                    label="Иконка (SVG/PNG)"
                    value={c.iconUrl ?? ""}
                    onChange={(url) => updateChannel(i, { iconUrl: url })}
                    canEdit={canEdit}
                  />
                  <IconField
                    label="Иконка при наведении"
                    value={c.iconHoverUrl ?? ""}
                    onChange={(url) => updateChannel(i, { iconHoverUrl: url })}
                    canEdit={canEdit}
                  />
                </div>
              </div>
              {canEdit ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghostDanger"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => removeChannel(i)}
                  >
                    Удалить канал
                  </Button>
                </div>
              ) : null}
            </div>
          ))}

          {canEdit ? (
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addChannel}>
              Добавить канал
            </Button>
          ) : null}
        </div>

        <div className="divider my-5" />

        <Textarea
          label="Требования для получения доступа / примечания (необязательно)"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          rows={3}
          disabled={!canEdit}
          placeholder="Например: доступ к ЛК DriveMods выдаётся дилерам с оборотом от..."
        />

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

      <Card className="h-fit">
        <div className="text-xs uppercase tracking-widest text-ink-muted mb-3">Предпросмотр</div>
        {intro.trim() ? <p className="text-sm text-ink-muted mb-3">{intro}</p> : null}
        <div className="space-y-2">
          {channels.filter((c) => c.label.trim() && c.url.trim()).length === 0 ? (
            <div className="rounded-panel border border-dashed border-hairline px-4 py-6 text-center text-sm text-ink-subtle">
              Добавьте канал, чтобы увидеть предпросмотр
            </div>
          ) : (
            channels
              .filter((c) => c.label.trim() && c.url.trim())
              .map((c, i) => <SupportLinkCard key={i} channel={c} />)
          )}
        </div>
      </Card>
    </div>
  );
}
