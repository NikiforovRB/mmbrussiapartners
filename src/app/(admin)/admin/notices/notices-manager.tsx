"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, EyeOff, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Toggle } from "@/components/ui/toggle";
import { Modal } from "@/components/ui/modal";
import { formatRuDateTime } from "@/lib/dates";

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  acks: number;
  createdAt: string;
};

export function NoticesManager({ notices, totalUsers }: { notices: NoticeRow[]; totalUsers: number }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NoticeRow | null>(null);

  function openCreate() {
    setEditing(null);
    setEditOpen(true);
  }
  function openEdit(n: NoticeRow) {
    setEditing(n);
    setEditOpen(true);
  }

  async function toggleActive(n: NoticeRow) {
    const res = await fetch(`/api/notices/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !n.active }),
    });
    if (!res.ok) {
      toast.error("Ошибка");
      return;
    }
    toast.success(n.active ? "Уведомление отключено" : "Уведомление включено");
    router.refresh();
  }

  async function remove(n: NoticeRow) {
    if (!confirm(`Удалить уведомление «${n.title}»?`)) return;
    const res = await fetch(`/api/notices/${n.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Ошибка");
      return;
    }
    toast.success("Уведомление удалено");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted max-w-2xl">
          Активное уведомление показывается каждому пользователю при входе, пока он не нажмёт
          «Ознакомился». Окно нельзя закрыть иначе.
        </p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Создать уведомление
        </Button>
      </div>

      {notices.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-sm text-ink-muted">Уведомлений пока нет</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-display tracking-tight">{n.title}</div>
                    {n.active ? <Tag tone="success">Активно</Tag> : <Tag tone="muted">Отключено</Tag>}
                  </div>
                  <div className="mt-1.5 text-sm text-ink-muted whitespace-pre-line line-clamp-3">
                    {n.body}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Ознакомились: {n.acks} из {totalUsers}
                    </span>
                    <span>{formatRuDateTime(n.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={n.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    onClick={() => toggleActive(n)}
                  >
                    {n.active ? "Отключить" : "Включить"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => openEdit(n)}
                  >
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghostDanger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => remove(n)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NoticeModal
        open={editOpen}
        notice={editing}
        onClose={() => setEditOpen(false)}
        onDone={() => {
          setEditOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function NoticeModal({
  open,
  notice,
  onClose,
  onDone,
}: {
  open: boolean;
  notice: NoticeRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ title?: string; body?: string }>({});

  React.useEffect(() => {
    if (!open) return;
    setTitle(notice?.title ?? "");
    setBody(notice?.body ?? "");
    setActive(notice?.active ?? true);
    setErrors({});
  }, [open, notice]);

  async function submit() {
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Укажите заголовок";
    if (!body.trim()) next.body = "Укажите текст";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const res = await fetch(notice ? `/api/notices/${notice.id}` : "/api/notices", {
      method: notice ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), active }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success(notice ? "Уведомление обновлено" : "Уведомление создано");
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={notice ? "Изменить уведомление" : "Новое уведомление"}
      description="Пользователь увидит его при следующем входе."
    >
      <div className="space-y-3">
        <Input
          label="Заголовок"
          value={title}
          error={errors.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Плановые технические работы"
        />
        <Textarea
          label="Текст уведомления"
          value={body}
          error={errors.body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Подробности, которые важно донести до пользователей."
        />
        <Toggle checked={active} onChange={setActive} label="Показывать при входе" />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={submit} loading={loading} icon={<Plus className="h-4 w-4" />}>
          {notice ? "Сохранить" : "Создать"}
        </Button>
      </div>
    </Modal>
  );
}
