"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tag } from "@/components/ui/tag";
import { cn, plural } from "@/lib/utils";

type Category = { id: string; name: string; parentId: string | null; count: number };

const inputClass =
  "field-control h-9 min-w-0 flex-1 rounded-btn border border-hairline bg-white px-3 text-sm placeholder:text-ink-subtle focus:border-accent focus:outline-none";

async function send(url: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) {
    toast.error("Нет связи с сервером");
    return false;
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    toast.error(j.error ?? "Не удалось сохранить");
    return false;
  }
  return true;
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-btn text-ink-muted transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-muted hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

/** Редактор дерева категорий: два уровня, переименование, порядок, удаление. */
export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [addingFor, setAddingFor] = React.useState<string | null>(null);
  const [childName, setChildName] = React.useState("");
  const [rootName, setRootName] = React.useState("");
  const [deleting, setDeleting] = React.useState<Category | null>(null);

  const roots = categories.filter((c) => !c.parentId);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  async function run(action: () => Promise<boolean>, success?: string) {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) {
      if (success) toast.success(success);
      router.refresh();
    }
    return ok;
  }

  async function create(name: string, parentId: string | null) {
    if (!name.trim()) return false;
    return run(() => send("/api/knowledge/categories", "POST", { name: name.trim(), parentId }));
  }

  async function saveName() {
    if (!editing) return;
    const ok = await run(() => send(`/api/knowledge/categories/${editing.id}`, "PATCH", { name: editing.name }));
    if (ok) setEditing(null);
  }

  function move(id: string, direction: "up" | "down") {
    void run(() => send(`/api/knowledge/categories/${id}`, "PATCH", { move: direction }));
  }

  async function remove() {
    if (!deleting) return;
    const ok = await run(() => send(`/api/knowledge/categories/${deleting.id}`, "DELETE"), "Категория удалена");
    if (ok) setDeleting(null);
  }

  function row(c: Category, index: number, siblings: number, level: 0 | 1) {
    const isEditing = editing?.id === c.id;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 py-2",
          level === 1 && "ml-6 border-l border-hairline pl-4",
        )}
      >
        {isEditing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <input
              autoFocus
              value={editing.name}
              maxLength={80}
              onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
              onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
              className={inputClass}
              aria-label="Название категории"
            />
            <IconButton label="Сохранить" onClick={() => void saveName()} disabled={busy || !editing.name.trim()}>
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton label="Отменить" onClick={() => setEditing(null)}>
              <X className="h-4 w-4" />
            </IconButton>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={cn("truncate", level === 0 && "font-display tracking-tight")}>{c.name}</span>
            <Tag tone="muted">
              {c.count} {plural(c.count, ["статья", "статьи", "статей"])}
            </Tag>
          </div>
        )}
        {!isEditing ? (
          <div className="flex items-center">
            <IconButton label="Выше" onClick={() => move(c.id, "up")} disabled={busy || index === 0}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label="Ниже" onClick={() => move(c.id, "down")} disabled={busy || index === siblings - 1}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            {level === 0 ? (
              <IconButton
                label="Добавить подкатегорию"
                onClick={() => {
                  setAddingFor(c.id);
                  setChildName("");
                }}
                disabled={busy}
              >
                <FolderPlus className="h-4 w-4" />
              </IconButton>
            ) : null}
            <IconButton label="Переименовать" onClick={() => setEditing({ id: c.id, name: c.name })} disabled={busy}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton label="Удалить" onClick={() => setDeleting(c)} disabled={busy} danger>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ) : null}
      </div>
    );
  }

  const deletingChildren = deleting ? childrenOf(deleting.id) : [];
  const deletingArticles = deleting
    ? deleting.count + deletingChildren.reduce((sum, c) => sum + c.count, 0)
    : 0;

  return (
    <Card>
      <div className="font-display text-lg tracking-tight">Категории и подкатегории</div>
      <p className="mt-1 text-sm text-ink-muted">
        Два уровня вложенности: категория и её подкатегории. Порядок здесь — такой же, как в меню
        базы знаний.
      </p>

      <div className="mt-4 divide-y divide-hairline border-y border-hairline">
        {roots.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-muted">Категорий пока нет</div>
        ) : null}
        {roots.map((root, i) => {
          const children = childrenOf(root.id);
          return (
            <div key={root.id} className="py-1">
              {row(root, i, roots.length, 0)}
              {children.map((child, j) => (
                <React.Fragment key={child.id}>{row(child, j, children.length, 1)}</React.Fragment>
              ))}
              {addingFor === root.id ? (
                <form
                  className="ml-6 flex items-center gap-1 border-l border-hairline py-2 pl-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await create(childName, root.id)) setAddingFor(null);
                  }}
                >
                  <input
                    autoFocus
                    value={childName}
                    maxLength={80}
                    onChange={(e) => setChildName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setAddingFor(null)}
                    placeholder={`Подкатегория в «${root.name}»`}
                    className={inputClass}
                    aria-label="Название подкатегории"
                  />
                  <IconButton
                    label="Добавить"
                    onClick={() => void create(childName, root.id).then((ok) => ok && setAddingFor(null))}
                    disabled={busy || !childName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Отменить" onClick={() => setAddingFor(null)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await create(rootName, null)) setRootName("");
        }}
      >
        <input
          value={rootName}
          maxLength={80}
          onChange={(e) => setRootName(e.target.value)}
          placeholder="Название новой категории"
          className={cn(inputClass, "h-11 basis-60 rounded-panel")}
          aria-label="Название новой категории"
        />
        <Button type="submit" icon={<Plus className="h-4 w-4" />} disabled={busy || !rootName.trim()}>
          Добавить категорию
        </Button>
      </form>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Удалить категорию?"
        size="sm"
        description={
          deleting ? (
            <>
              Категория <span className="text-ink">«{deleting.name}»</span>
              {deletingChildren.length > 0
                ? ` и ${deletingChildren.length} ${plural(deletingChildren.length, ["подкатегория", "подкатегории", "подкатегорий"])} будут удалены.`
                : " будет удалена."}
              {deletingArticles > 0
                ? ` ${deletingArticles} ${plural(deletingArticles, ["статья останется", "статьи останутся", "статей останутся"])} без категории.`
                : ""}
            </>
          ) : null
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Отмена
          </Button>
          <Button variant="danger" loading={busy} icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
            Удалить
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
