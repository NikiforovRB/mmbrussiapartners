"use client";

import * as React from "react";
import { Save, Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";

export function SettingsForm({
  initial,
}: {
  initial: { phone: string; email: string; address: string };
}) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [data, setData] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
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
        <div className="font-display text-lg  tracking-tight mb-4">Контакты компании</div>
        <div className="space-y-3">
          <Input label="Телефон" disabled={!canEdit} icon={<Phone className="h-4 w-4" />} value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} />
          <Input label="Email" disabled={!canEdit} icon={<Mail className="h-4 w-4" />} value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
          <Input label="Адрес" disabled={!canEdit} icon={<MapPin className="h-4 w-4" />} value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })} />
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
      <Card tone="dark" className="relative overflow-hidden">
        <div className="absolute -top-32 -right-20 h-72 w-72 rounded-full blob"
          style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
        <div className="relative">
          <div className="text-xs uppercase tracking-widest text-white/60">Публичный API</div>
          <h2 className="mt-2 font-display text-2xl  tracking-tightest">
            mmbrussia.ru
          </h2>
          <p className="mt-2 text-white/70 text-sm">
            Список одобренных представителей с включённым тогглом "Показывать телефон на сайте" доступен по адресу:
          </p>
          <code className="mt-3 block rounded-panel surface-glass-dark p-3 text-xs">
            GET https://&lt;your-domain&gt;/api/public/representatives
          </code>
          <div className="mt-3 text-xs text-white/60">
            CORS разрешён для домена <code>{process.env.PUBLIC_SITE_ORIGIN ?? "—"}</code>. Кэш CDN 60 секунд.
          </div>
        </div>
      </Card>
    </div>
  );
}
