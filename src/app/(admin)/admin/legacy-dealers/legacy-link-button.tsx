"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Search, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export type LegacyCandidate = {
  id: string;
  email: string;
  fio: string;
  city: string | null;
  phone?: string | null;
  linkedTo?: { id: string; name: string } | null;
};

export function LegacyLinkButton({
  legacyId,
  label,
  linked,
  suggestions,
  canEdit,
}: {
  legacyId: string;
  label: string;
  linked: LegacyCandidate | null;
  suggestions: LegacyCandidate[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmUnlink, setConfirmUnlink] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<LegacyCandidate[] | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/legacy-dealers/candidates?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const j = await res.json().catch(() => ({}));
        setResults(res.ok ? (j.items ?? []) : []);
      } catch {
        // запрос отменён новым вводом
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  async function save(userId: string | null) {
    setBusy(userId ?? "unlink");
    try {
      const res = await fetch(`/api/legacy-dealers/${legacyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Не удалось сохранить");
        return;
      }
      toast.success(userId ? "Привязано: первая генерация — по цене дилера" : "Привязка снята");
      setOpen(false);
      setConfirmUnlink(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (linked) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={`/admin/dealers/${linked.id}`}
          className="min-w-0 truncate text-sm hover:text-accent"
          title={linked.email}
        >
          {linked.fio || linked.email}
        </Link>
        {canEdit ? (
          <>
            <Button
              size="sm"
              variant="ghostDanger"
              className="w-8 shrink-0 px-0"
              aria-label="Отвязать"
              title="Отвязать"
              icon={<Unlink className="h-3.5 w-3.5" />}
              onClick={() => setConfirmUnlink(true)}
            />
            <Modal
              open={confirmUnlink}
              onClose={() => setConfirmUnlink(false)}
              size="sm"
              title="Отвязать от старого ЛК?"
              description={`${linked.fio || linked.email} перестанет считаться дилером из старого ЛК («${label}»): первая генерация снова пойдёт по клиентской цене.`}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setConfirmUnlink(false)}>
                    Отмена
                  </Button>
                  <Button variant="danger" loading={busy === "unlink"} onClick={() => save(null)}>
                    Отвязать
                  </Button>
                </>
              }
            />
          </>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return <span className="text-sm text-ink-subtle">—</span>;

  const list = results ?? suggestions;
  return (
    <>
      <Button size="sm" variant="secondary" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
        Привязать
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Привязать «${label}»`}
        description="Выберите представителя портала. Он будет считаться дилером из старого ЛК: первая генерация — по цене дилера, а не по клиентской."
      >
        <div className="space-y-3">
          <Input
            autoFocus
            icon={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя, email, телефон, город…"
          />
          <div className="text-[11.5px] uppercase tracking-tight text-ink-subtle">
            {results ? "Результаты поиска" : suggestions.length ? "Похожие представители" : "Начните вводить для поиска"}
          </div>
          {list.length === 0 && results ? (
            <div className="rounded-panel bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">Никого не нашли</div>
          ) : null}
          <ul className="divide-y divide-hairline rounded-panel border border-hairline empty:hidden">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{c.fio || c.email}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {[c.email, c.city, c.phone].filter(Boolean).join(" · ")}
                  </div>
                  {c.linkedTo ? (
                    <div className="text-xs text-[#a16207]">Уже привязан к «{c.linkedTo.name}»</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  disabled={Boolean(c.linkedTo) || busy !== null}
                  loading={busy === c.id}
                  onClick={() => save(c.id)}
                >
                  Привязать
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
