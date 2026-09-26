"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, Shield, ShieldCheck, UserCog, Ban, RotateCcw, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { StatusTag } from "@/components/ui/status-tag";
import { Avatar } from "@/components/ui/avatar";
import { formatRuDateTime } from "@/lib/dates";

const ADMIN_ROLE_NAME = "Администратор";

export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  isSystemRole: boolean;
  isSuperAdmin: boolean;
  status: string;
  lastLoginAt: string | null;
};

export type AssignableRole = { id: string; name: string; isSystem: boolean };

export function UsersManager({
  users,
  roles,
  meId,
  meIsSuperAdmin,
}: {
  users: ManagedUser[];
  roles: AssignableRole[];
  meId: string;
  meIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [passwordFor, setPasswordFor] = React.useState<ManagedUser | null>(null);
  const [roleFor, setRoleFor] = React.useState<ManagedUser | null>(null);

  const admins = users.filter((u) => u.isSuperAdmin || u.roleName === ADMIN_ROLE_NAME);
  const staff = users.filter((u) => !(u.isSuperAdmin || u.roleName === ADMIN_ROLE_NAME));

  async function setStatus(u: ManagedUser, status: "APPROVED" | "SUSPENDED") {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success(status === "SUSPENDED" ? "Пользователь заблокирован" : "Доступ восстановлен");
    router.refresh();
  }

  async function revokeSessions(u: ManagedUser) {
    if (!confirm(`Завершить все сеансы ${u.email}? Пользователю придётся войти заново.`)) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeSessions: true }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Сеансы завершены — в течение 30 секунд");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
          Добавить пользователя
        </Button>
      </div>

      <UserSection
        title="Администраторы"
        subtitle="Полный доступ к кабинету"
        icon={<ShieldCheck className="h-4 w-4 text-accent" />}
        users={admins}
        meId={meId}
        meIsSuperAdmin={meIsSuperAdmin}
        onPassword={setPasswordFor}
        onRole={setRoleFor}
        onStatus={setStatus}
        onRevoke={revokeSessions}
      />

      <UserSection
        title="Пользователи с ролями"
        subtitle="Сотрудники с ограниченными правами"
        icon={<Shield className="h-4 w-4 text-ink-subtle" />}
        users={staff}
        meId={meId}
        meIsSuperAdmin={meIsSuperAdmin}
        onPassword={setPasswordFor}
        onRole={setRoleFor}
        onStatus={setStatus}
        onRevoke={revokeSessions}
      />

      <AddUserModal
        open={addOpen}
        roles={roles}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          router.refresh();
        }}
      />
      <PasswordModal
        user={passwordFor}
        onClose={() => setPasswordFor(null)}
        onDone={() => setPasswordFor(null)}
      />
      <RoleModal
        user={roleFor}
        roles={roles}
        onClose={() => setRoleFor(null)}
        onDone={() => {
          setRoleFor(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function UserSection({
  title,
  subtitle,
  icon,
  users,
  meId,
  meIsSuperAdmin,
  onPassword,
  onRole,
  onStatus,
  onRevoke,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  users: ManagedUser[];
  meId: string;
  meIsSuperAdmin: boolean;
  onPassword: (u: ManagedUser) => void;
  onRole: (u: ManagedUser) => void;
  onStatus: (u: ManagedUser, status: "APPROVED" | "SUSPENDED") => void;
  onRevoke: (u: ManagedUser) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
        {icon}
        <div>
          <div className="font-display tracking-tight">{title}</div>
          <div className="text-xs text-ink-muted">{subtitle}</div>
        </div>
        <Tag tone="muted" className="ml-auto">
          {users.length}
        </Tag>
      </div>

      {users.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-ink-muted">Список пуст</div>
      ) : (
        <ul className="divide-y divide-hairline">
          {users.map((u) => {
            const isSelf = u.id === meId;
            // Суперадмина трогает только суперадмин.
            const locked = u.isSuperAdmin && !meIsSuperAdmin;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Avatar name={u.name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{u.name}</span>
                    {isSelf ? <Tag tone="accent">Вы</Tag> : null}
                    {u.isSuperAdmin ? <Tag tone="muted">Супер-админ</Tag> : null}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{u.email}</div>
                </div>
                <div className="hidden sm:flex flex-col items-start gap-1 min-w-[150px]">
                  <Tag tone={u.isSystemRole ? "muted" : "neutral"}>{u.roleName}</Tag>
                  <span className="text-[11px] text-ink-subtle">
                    {u.lastLoginAt ? `Вход: ${formatRuDateTime(u.lastLoginAt)}` : "Не входил"}
                  </span>
                </div>
                <StatusTag kind="user" status={u.status} />
                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    disabled={locked}
                    onClick={() => onPassword(u)}
                  >
                    Пароль
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<UserCog className="h-3.5 w-3.5" />}
                    disabled={locked || isSelf}
                    title={isSelf ? "Нельзя менять собственную роль" : undefined}
                    onClick={() => onRole(u)}
                  >
                    Роль
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<LogOut className="h-3.5 w-3.5" />}
                    disabled={locked || isSelf || u.status === "SUSPENDED"}
                    title={isSelf ? "Свои сеансы завершите выходом из кабинета" : "Выйти на всех устройствах"}
                    onClick={() => onRevoke(u)}
                  >
                    Сеансы
                  </Button>
                  {u.status === "SUSPENDED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      disabled={locked || isSelf}
                      onClick={() => onStatus(u, "APPROVED")}
                    >
                      Разблокировать
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghostDanger"
                      icon={<Ban className="h-3.5 w-3.5" />}
                      disabled={locked || isSelf}
                      title={isSelf ? "Нельзя заблокировать себя" : undefined}
                      onClick={() => onStatus(u, "SUSPENDED")}
                    >
                      Заблокировать
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AddUserModal({
  open,
  roles,
  onClose,
  onDone,
}: {
  open: boolean;
  roles: AssignableRole[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [roleId, setRoleId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string; roleId?: string }>({});

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setRoleId("");
      setErrors({});
    }
  }, [open]);

  function validate() {
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Некорректный email";
    if (password.length < 8) next.password = "Минимум 8 символов";
    if (!roleId) next.roleId = "Выберите роль";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function create() {
    if (!validate()) return;
    setLoading(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, roleId }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось создать");
      return;
    }
    toast.success("Пользователь создан");
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый пользователь"
      description="Сотрудник сможет войти по email и паролю."
    >
      <div className="space-y-3">
        <Input
          label="Email"
          type="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@mmbrussia.ru"
        />
        <Input
          label="Пароль"
          type="password"
          value={password}
          error={errors.password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 8 символов"
        />
        <div className="space-y-1.5">
          <Select
            label="Роль"
            value={roleId || null}
            onChange={(v) => setRoleId(v)}
            placeholder="Выберите роль"
            options={roles.map((r) => ({
              value: r.id,
              label: r.name,
              hint: r.isSystem ? "Системная" : "Кастомная",
            }))}
          />
          {errors.roleId ? <p className="text-xs text-danger">{errors.roleId}</p> : null}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={create} loading={loading} icon={<Plus className="h-4 w-4" />}>
          Создать
        </Button>
      </div>
    </Modal>
  );
}

function PasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: ManagedUser | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user) {
      setPassword("");
      setRepeat("");
      setError(null);
    }
  }, [user]);

  async function submit() {
    if (password.length < 8) {
      setError("Минимум 8 символов");
      return;
    }
    if (password !== repeat) {
      setError("Пароли не совпадают");
      return;
    }
    if (!user) return;
    setLoading(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Пароль изменён");
    onDone();
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Смена пароля"
      description={user ? user.email : undefined}
      size="sm"
    >
      <div className="space-y-3">
        <Input
          label="Новый пароль"
          type="password"
          value={password}
          error={error ?? undefined}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 8 символов"
        />
        <Input
          label="Повторите пароль"
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={submit} loading={loading} icon={<KeyRound className="h-4 w-4" />}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

function RoleModal({
  user,
  roles,
  onClose,
  onDone,
}: {
  user: ManagedUser | null;
  roles: AssignableRole[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [roleId, setRoleId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (user) setRoleId(user.roleId);
  }, [user]);

  async function submit() {
    if (!user) return;
    setLoading(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Роль обновлена");
    onDone();
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Смена роли"
      description={user ? user.email : undefined}
      size="sm"
    >
      <Select
        label="Роль"
        value={roleId || null}
        onChange={(v) => setRoleId(v)}
        placeholder="Выберите роль"
        options={roles.map((r) => ({
          value: r.id,
          label: r.name,
          hint: r.isSystem ? "Системная" : "Кастомная",
        }))}
      />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={submit} loading={loading} icon={<UserCog className="h-4 w-4" />}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}
