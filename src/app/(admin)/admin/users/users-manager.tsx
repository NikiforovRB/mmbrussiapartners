"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  KeyRound,
  Shield,
  ShieldCheck,
  UserCog,
  Ban,
  RotateCcw,
  LogOut,
  CheckCircle2,
  Pencil,
  Camera,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { StatusTag } from "@/components/ui/status-tag";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRuDateTime } from "@/lib/dates";
import { fioFromParts } from "@/lib/utils";

const ADMIN_ROLE_NAME = "Администратор";

export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  profile: { lastName: string; firstName: string; middleName: string; phone: string };
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
  const [editFor, setEditFor] = React.useState<ManagedUser | null>(null);

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
        onEdit={setEditFor}
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
        onEdit={setEditFor}
        onPassword={setPasswordFor}
        onRole={setRoleFor}
        onStatus={setStatus}
        onRevoke={revokeSessions}
      />

      <EditUserModal
        user={editFor}
        canGrantSuperAdmin={meIsSuperAdmin && editFor?.id !== meId}
        onClose={() => setEditFor(null)}
        onChanged={() => router.refresh()}
        onDone={() => {
          setEditFor(null);
          router.refresh();
        }}
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
  onEdit,
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
  onEdit: (u: ManagedUser) => void;
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
                <Avatar name={u.name} src={u.avatarUrl} size={38} />
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
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    disabled={locked}
                    title="ФИО, телефон, email и фото"
                    onClick={() => onEdit(u)}
                  >
                    Изменить
                  </Button>
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
  const [confirm, setConfirm] = React.useState("");
  const [roleId, setRoleId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    email?: string;
    password?: string;
    confirm?: string;
    roleId?: string;
  }>({});

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setConfirm("");
      setRoleId("");
      setErrors({});
    }
  }, [open]);

  const passwordsMatch = password.length > 0 && confirm.length > 0 && password === confirm;

  function validate() {
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Некорректный email";
    if (password.length < 8) next.password = "Минимум 8 символов";
    if (confirm !== password) next.confirm = "Пароли не совпадают";
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
          autoComplete="new-password"
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password || errors.confirm)
              setErrors((p) => ({ ...p, password: undefined, confirm: undefined }));
          }}
          placeholder="Минимум 8 символов"
        />
        <div className="space-y-1.5">
          <Input
            label="Повторите пароль"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={errors.confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
            }}
            placeholder="Введите пароль ещё раз"
          />
          {passwordsMatch && !errors.confirm ? (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Пароли совпадают
            </p>
          ) : null}
        </div>
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

function EditUserModal({
  user,
  canGrantSuperAdmin,
  onClose,
  onChanged,
  onDone,
}: {
  user: ManagedUser | null;
  canGrantSuperAdmin: boolean;
  onClose: () => void;
  /** Фото сохраняется сразу — список обновляем, не закрывая окно. */
  onChanged: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState({ lastName: "", firstName: "", middleName: "", phone: "", email: "" });
  const [superAdmin, setSuperAdmin] = React.useState(false);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; phone?: string }>({});

  React.useEffect(() => {
    if (user) {
      setForm({ ...user.profile, email: user.email });
      setSuperAdmin(user.isSuperAdmin);
      setPhoto(user.avatarUrl);
      setErrors({});
    }
  }, [user]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "email" || key === "phone") setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function uploadPhoto(file: File) {
    if (!user) return;
    setPhotoBusy(true);
    const body = new FormData();
    body.append("avatar", file);
    const res = await fetch(`/api/users/${user.id}/avatar`, { method: "POST", body });
    setPhotoBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Не удалось загрузить фото");
      return;
    }
    setPhoto((j.url as string) ?? null);
    toast.success("Фото обновлено");
    onChanged();
  }

  async function removePhoto() {
    if (!user) return;
    setPhotoBusy(true);
    const res = await fetch(`/api/users/${user.id}/avatar`, { method: "DELETE" });
    setPhotoBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить фото");
      return;
    }
    setPhoto(null);
    toast.success("Фото удалено");
    onChanged();
  }

  async function save() {
    if (!user) return;
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Некорректный email";
    const digits = form.phone.replace(/\D/g, "");
    if (digits && digits.length < 10) next.phone = "Некорректный телефон";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email.trim(),
        profile: {
          lastName: form.lastName,
          firstName: form.firstName,
          middleName: form.middleName,
          phone: form.phone,
        },
        ...(canGrantSuperAdmin && { isSuperAdmin: superAdmin }),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success("Данные пользователя сохранены");
    onDone();
  }

  const displayName =
    fioFromParts({ lastName: form.lastName, firstName: form.firstName, middleName: form.middleName }) ||
    form.email ||
    user?.email;

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Данные пользователя"
      description={user ? user.email : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} loading={loading} icon={<CheckCircle2 className="h-4 w-4" />}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={displayName} src={photo} size={64} />
          <label
            title="Изменить фото"
            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-accent text-white cursor-pointer transition-opacity hover:opacity-90"
          >
            {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={photoBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-lg tracking-tight">{displayName}</div>
          <div className="text-xs text-ink-muted">JPG, PNG, WebP или GIF до 2 МБ — сохраняется сразу</div>
          {photo ? (
            <button
              type="button"
              onClick={removePhoto}
              disabled={photoBusy}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Удалить фото
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Input label="Фамилия" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        <Input label="Имя" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        <Input label="Отчество" value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
        <Input
          label="Телефон"
          type="tel"
          value={form.phone}
          error={errors.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+7 900 000-00-00"
        />
        <div className="sm:col-span-2">
          <Input
            label="Email для входа"
            type="email"
            value={form.email}
            error={errors.email}
            onChange={(e) => set("email", e.target.value)}
            hint={
              user && form.email.trim().toLowerCase() !== user.email
                ? "Войти можно будет только по новому адресу"
                : undefined
            }
          />
        </div>
      </div>

      {canGrantSuperAdmin ? (
        <div className="mt-4 rounded-btn border border-hairline px-4 py-3">
          <Checkbox
            checked={superAdmin}
            onChange={setSuperAdmin}
            label="Супер-админ"
            description="Полный доступ ко всему кабинету, включая управление другими супер-админами"
          />
        </div>
      ) : null}
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
