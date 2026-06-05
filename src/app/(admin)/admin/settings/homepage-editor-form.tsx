"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { HomepageContent } from "@/lib/homepage-content";
import { usePermissions } from "@/hooks/use-permissions";

export function HomepageEditorForm({ initial }: { initial: HomepageContent }) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [data, setData] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/homepage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка сохранения");
      return;
    }
    toast.success("Главная страница обновлена");
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="font-display text-lg tracking-tight mb-4">Шапка</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Пункт меню: Как это работает" value={data.header.navWorkflow} onChange={(e) => setData({ ...data, header: { ...data.header, navWorkflow: e.target.value } })} />
          <Input label="Пункт меню: Контакты" value={data.header.navContacts} onChange={(e) => setData({ ...data, header: { ...data.header, navContacts: e.target.value } })} />
          <Input label="Кнопка «Войти»" value={data.header.loginButton} onChange={(e) => setData({ ...data, header: { ...data.header, loginButton: e.target.value } })} />
          <Input label="Кнопка «Стать дилером»" value={data.header.registerButton} onChange={(e) => setData({ ...data, header: { ...data.header, registerButton: e.target.value } })} />
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg tracking-tight mb-4">Главный экран (Hero)</div>
        <div className="space-y-3">
          <Input label="Бейдж" value={data.hero.badge} onChange={(e) => setData({ ...data, hero: { ...data.hero, badge: e.target.value } })} />
          <Input label="Заголовок, строка 1" value={data.hero.titleLine1} onChange={(e) => setData({ ...data, hero: { ...data.hero, titleLine1: e.target.value } })} />
          <Input label="Заголовок, акцент" value={data.hero.titleHighlight} onChange={(e) => setData({ ...data, hero: { ...data.hero, titleHighlight: e.target.value } })} />
          <Textarea label="Описание" rows={3} value={data.hero.description} onChange={(e) => setData({ ...data, hero: { ...data.hero, description: e.target.value } })} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Кнопка входа" value={data.hero.loginButton} onChange={(e) => setData({ ...data, hero: { ...data.hero, loginButton: e.target.value } })} />
            <Input label="Кнопка регистрации" value={data.hero.registerButton} onChange={(e) => setData({ ...data, hero: { ...data.hero, registerButton: e.target.value } })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.hero.stats.map((stat, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Input
                  label={`Статистика ${i + 1}: значение`}
                  value={stat.value}
                  onChange={(e) => {
                    const stats = [...data.hero.stats];
                    stats[i] = { ...stats[i], value: e.target.value };
                    setData({ ...data, hero: { ...data.hero, stats } });
                  }}
                />
                <Input
                  label={`Статистика ${i + 1}: подпись`}
                  value={stat.label}
                  onChange={(e) => {
                    const stats = [...data.hero.stats];
                    stats[i] = { ...stats[i], label: e.target.value };
                    setData({ ...data, hero: { ...data.hero, stats } });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg tracking-tight mb-4">Как это работает</div>
        <div className="space-y-3">
          <Input label="Бейдж" value={data.workflow.badge} onChange={(e) => setData({ ...data, workflow: { ...data.workflow, badge: e.target.value } })} />
          <Input label="Заголовок, строка 1" value={data.workflow.titleLine1} onChange={(e) => setData({ ...data, workflow: { ...data.workflow, titleLine1: e.target.value } })} />
          <Input label="Заголовок, акцент" value={data.workflow.titleHighlight} onChange={(e) => setData({ ...data, workflow: { ...data.workflow, titleHighlight: e.target.value } })} />
          {data.workflow.steps.map((step, i) => (
            <div key={i} className="rounded-panel bg-white p-4 space-y-3">
              <div className="text-sm text-ink-muted">Шаг {i + 1}</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <Input
                  label="Номер"
                  value={step.number}
                  onChange={(e) => {
                    const steps = [...data.workflow.steps];
                    steps[i] = { ...steps[i], number: e.target.value };
                    setData({ ...data, workflow: { ...data.workflow, steps } });
                  }}
                />
                <Input
                  label="Заголовок"
                  value={step.title}
                  onChange={(e) => {
                    const steps = [...data.workflow.steps];
                    steps[i] = { ...steps[i], title: e.target.value };
                    setData({ ...data, workflow: { ...data.workflow, steps } });
                  }}
                />
                <div className="sm:col-span-1" />
              </div>
              <Textarea
                label="Текст"
                rows={2}
                value={step.text}
                onChange={(e) => {
                  const steps = [...data.workflow.steps];
                  steps[i] = { ...steps[i], text: e.target.value };
                  setData({ ...data, workflow: { ...data.workflow, steps } });
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg tracking-tight mb-4">Блок контактов (CTA)</div>
        <div className="space-y-3">
          <Input label="Заголовок" value={data.cta.title} onChange={(e) => setData({ ...data, cta: { ...data.cta, title: e.target.value } })} />
          <Textarea label="Описание" rows={2} value={data.cta.description} onChange={(e) => setData({ ...data, cta: { ...data.cta, description: e.target.value } })} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Кнопка регистрации" value={data.cta.registerButton} onChange={(e) => setData({ ...data, cta: { ...data.cta, registerButton: e.target.value } })} />
            <Input label="Кнопка входа" value={data.cta.loginButton} onChange={(e) => setData({ ...data, cta: { ...data.cta, loginButton: e.target.value } })} />
            <Input label="Подпись телефона" value={data.cta.phoneLabel} onChange={(e) => setData({ ...data, cta: { ...data.cta, phoneLabel: e.target.value } })} />
            <Input label="Подпись почты" value={data.cta.emailLabel} onChange={(e) => setData({ ...data, cta: { ...data.cta, emailLabel: e.target.value } })} />
          </div>
          <p className="text-xs text-ink-muted">
            Телефон и email подтягиваются из вкладки «Основные данные».
          </p>
        </div>
      </Card>

      <Card>
        <div className="font-display text-lg tracking-tight mb-4">Подвал</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input label="Текст копирайта" value={data.footer.copyrightPrefix} onChange={(e) => setData({ ...data, footer: { ...data.footer, copyrightPrefix: e.target.value } })} />
          <Input label="Ссылка «Войти»" value={data.footer.loginLink} onChange={(e) => setData({ ...data, footer: { ...data.footer, loginLink: e.target.value } })} />
          <Input label="Ссылка «Регистрация»" value={data.footer.registerLink} onChange={(e) => setData({ ...data, footer: { ...data.footer, registerLink: e.target.value } })} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          loading={saving}
          disabled={!canEdit}
          title={canEdit ? undefined : "Нет права на редактирование настроек"}
          icon={<Save className="h-4 w-4" />}
          onClick={save}
        >
          Сохранить главную страницу
        </Button>
      </div>
    </div>
  );
}
