"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { PERMISSIONS, PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import { usePermissions } from "@/hooks/use-permissions";

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

export function RolesManager({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("roles.manage");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(roles[0]?.id ?? null);
  const active = roles.find((r) => r.id === activeId) ?? roles[0];
  const [perms, setPerms] = React.useState<string[]>(active?.permissions ?? []);
  const [name, setName] = React.useState(active?.name ?? "");
  const [description, setDescription] = React.useState(active?.description ?? "");
  const [saving, setSaving] = React.useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setPerms(active?.permissions ?? []);
    setName(active?.name ?? "");
    setDescription(active?.description ?? "");
  }, [active?.id]);

  function toggle(p: PermissionKey) {
    setPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  function toggleGroup(group: PermissionKey[], allOn: boolean) {
    setPerms((prev) => {
      const set = new Set(prev);
      group.forEach((p) => (allOn ? set.delete(p) : set.add(p)));
      return Array.from(set);
    });
  }

  async function save() {
    if (!active) return;
    if (!name.trim()) {
      toast.error("Укажите название роли");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/roles/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, permissions: perms }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка сохранения");
      return;
    }
    toast.success("Роль обновлена");
    router.refresh();
  }

  async function deleteRole() {
    if (!active || active.isSystem) return;
    if (!confirm(`Удалить роль "${active.name}"?`)) return;
    const res = await fetch(`/api/roles/${active.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить");
      return;
    }
    toast.success("Роль удалена");
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display  tracking-tight">Список ролей</div>
          <Button
            size="sm"
            disabled={!canManage}
            title={canManage ? undefined : "Нет права на управление ролями"}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            Создать
          </Button>
        </div>
        <ul className="space-y-1.5">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setActiveId(r.id)}
                className={`w-full flex items-center justify-between gap-2 rounded-panel px-3 py-2.5 text-sm text-left transition-colors ${
                  active?.id === r.id ? "bg-white" : "hover:bg-white/60"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {r.isSystem ? (
                    <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
                  ) : (
                    <Shield className="h-4 w-4 text-ink-subtle shrink-0" />
                  )}
                  <span className="truncate">{r.name}</span>
                </span>
                {r.isSystem ? <Tag tone="muted">Системная</Tag> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        {active ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <div className="text-xs uppercase tracking-widest text-ink-muted">
                  {active.isSystem ? "Системная роль" : "Кастомная роль"}
                </div>
                <Input
                  className="mt-2 text-xl font-display "
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={active.isSystem}
                />
                <Input
                  className="mt-2 text-sm"
                  value={description ?? ""}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Описание роли"
                  disabled={active.isSystem}
                />
              </div>
              <div className="flex gap-2">
                {!active.isSystem ? (
                  <>
                    <Button
                      variant="ghost"
                      disabled={!canManage}
                      title={canManage ? undefined : "Нет права на управление ролями"}
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={deleteRole}
                    >
                      Удалить
                    </Button>
                    <Button
                      loading={saving}
                      disabled={!canManage}
                      title={canManage ? undefined : "Нет права на управление ролями"}
                      icon={<Save className="h-4 w-4" />}
                      onClick={save}
                    >
                      Сохранить
                    </Button>
                  </>
                ) : (
                  <Tag tone="muted">Системная роль не редактируется</Tag>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {Object.entries(PERMISSION_GROUPS).map(([group, list]) => {
                const all = list.every((p) => perms.includes(p));
                return (
                  <div key={group} className="rounded-panel bg-white p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-display  tracking-tight">{group}</div>
                      {!active.isSystem && canManage ? (
                        <button
                          onClick={() => toggleGroup(list, all)}
                          className="text-xs text-ink-muted hover:text-ink"
                        >
                          {all ? "Снять все" : "Выбрать все"}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {list.map((key) => (
                        <Checkbox
                          key={key}
                          checked={perms.includes(key)}
                          onChange={() => toggle(key)}
                          disabled={active.isSystem || !canManage}
                          label={PERMISSIONS[key]}
                          description={key}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-sm text-ink-muted text-center py-10">Создайте первую роль</div>
        )}
      </Card>

      <CreateRoleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setActiveId(id);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateRoleModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function create() {
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, permissions: [] }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось создать");
      return;
    }
    const j = await res.json();
    toast.success("Роль создана");
    setName("");
    setDescription("");
    onClose();
    onCreated(j.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="Новая роль" description="Название можно изменить позже.">
      <div className="space-y-3">
        <Input label="Название" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Менеджер по дилерам" />
        <Input label="Описание" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Кратко" />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button onClick={create} loading={loading} icon={<Plus className="h-4 w-4" />}>
          Создать
        </Button>
      </div>
    </Modal>
  );
}
