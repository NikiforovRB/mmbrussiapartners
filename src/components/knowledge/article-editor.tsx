"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Trash2,
  GripVertical,
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Link2,
  Quote,
  ListChecks,
  List,
  ListOrdered,
  Eraser,
  Image as ImageIcon,
  Video,
  Type,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { parseVideoEmbed, type KbBlock } from "@/lib/knowledge";
import { useAutosave, useUnsavedChangesWarning } from "@/hooks/use-autosave";

type EditBlock = { _id: string; block: KbBlock };

function wrap(block: KbBlock): EditBlock {
  return { _id: Math.random().toString(36).slice(2), block };
}

export type ArticleInitial = {
  id: string | null;
  title: string;
  /** Пустая строка — без категории. */
  categoryId: string;
  excerpt: string;
  published: boolean;
  blocks: KbBlock[];
};

export type ArticleCategoryOption = { id: string; name: string; parentId: string | null };

const NO_CATEGORY = "__none";

/** Тело запроса на сохранение; его же строка служит снимком для «есть правки». */
function articlePayload(a: Omit<ArticleInitial, "id">) {
  return JSON.stringify({
    title: a.title.trim(),
    categoryId: a.categoryId || null,
    excerpt: a.excerpt.trim() || null,
    blocks: a.blocks,
    published: a.published,
  });
}

function timeLabel(d: Date) {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function ArticleEditor({
  initial,
  categories,
}: {
  initial: ArticleInitial;
  categories: ArticleCategoryOption[];
}) {
  const router = useRouter();
  const [articleId, setArticleId] = React.useState(initial.id);
  const [title, setTitle] = React.useState(initial.title);
  const [categoryId, setCategoryId] = React.useState(initial.categoryId);
  const [excerpt, setExcerpt] = React.useState(initial.excerpt);
  const [published, setPublished] = React.useState(initial.published);
  const [blocks, setBlocks] = React.useState<EditBlock[]>(initial.blocks.map(wrap));
  const [saving, setSaving] = React.useState(false);
  const [titleError, setTitleError] = React.useState<string | null>(null);
  const [savedPayload, setSavedPayload] = React.useState(() => articlePayload(initial));
  const [autosavedAt, setAutosavedAt] = React.useState<Date | null>(null);
  const inFlight = React.useRef(false);

  const categoryOptions = React.useMemo(() => {
    const options: { value: string; label: string; search: string }[] = [
      { value: NO_CATEGORY, label: "Без категории", search: "без категории" },
    ];
    for (const root of categories.filter((c) => !c.parentId)) {
      options.push({ value: root.id, label: root.name, search: root.name });
      for (const child of categories.filter((c) => c.parentId === root.id)) {
        options.push({ value: child.id, label: `${root.name} / ${child.name}`, search: `${root.name} ${child.name}` });
      }
    }
    return options;
  }, [categories]);

  const payload = articlePayload({
    title,
    categoryId,
    excerpt,
    published,
    blocks: blocks.map((b) => b.block),
  });
  const dirty = payload !== savedPayload;

  const sensors = useSensors(
    // Небольшой порог, чтобы клик по ручке не начинал перетаскивание.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(id: string, next: KbBlock) {
    setBlocks((prev) => prev.map((b) => (b._id === id ? { ...b, block: next } : b)));
  }
  function remove(id: string) {
    setBlocks((prev) => prev.filter((b) => b._id !== id));
  }
  function add(block: KbBlock) {
    setBlocks((prev) => [...prev, wrap(block)]);
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b._id === active.id);
      const to = prev.findIndex((b) => b._id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }

  /** Сохраняет текущее состояние. Новая статья после первого сохранения получает id. */
  async function persist(mode: "manual" | "auto"): Promise<boolean> {
    if (inFlight.current) return false;
    if (!title.trim()) {
      if (mode === "manual") setTitleError("Укажите заголовок");
      return false;
    }
    setTitleError(null);
    inFlight.current = true;
    if (mode === "manual") setSaving(true);
    const body = payload;
    try {
      const res = await fetch(articleId ? `/api/knowledge/${articleId}` : "/api/knowledge", {
        method: articleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const message = j.error ?? "Ошибка сохранения";
        toast.error(mode === "auto" ? `Автосохранение не удалось: ${message}` : message);
        return false;
      }
      if (!articleId) {
        const j = (await res.json()) as { id: string };
        setArticleId(j.id);
        window.history.replaceState(null, "", `/admin/knowledge/${j.id}`);
      }
      setSavedPayload(body);
      return true;
    } catch {
      toast.error(mode === "auto" ? "Автосохранение не удалось: нет связи" : "Нет связи с сервером");
      return false;
    } finally {
      inFlight.current = false;
      if (mode === "manual") setSaving(false);
    }
  }

  useAutosave(
    async () => {
      if (await persist("auto")) setAutosavedAt(new Date());
    },
    { dirty },
  );
  useUnsavedChangesWarning(dirty);

  async function save() {
    if (!(await persist("manual"))) return;
    toast.success("Статья сохранена");
    router.push("/admin/knowledge");
    router.refresh();
  }

  async function removeArticle() {
    if (!articleId) return;
    if (!confirm("Удалить статью безвозвратно?")) return;
    const res = await fetch(`/api/knowledge/${articleId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Не удалось удалить");
      return;
    }
    toast.success("Статья удалена");
    router.push("/admin/knowledge");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Метаданные — без внешней обводки, только сами поля. */}
      <div className="space-y-3">
        <Input
          label="Заголовок"
          value={title}
          error={titleError ?? undefined}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Как выпустить лицензию"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Категория"
            value={categoryId || NO_CATEGORY}
            onChange={(v) => setCategoryId(v === NO_CATEGORY ? "" : v)}
            options={categoryOptions}
            searchable={categoryOptions.length > 8}
            searchPlaceholder="Найти категорию"
          />
          <div className="flex items-end pb-2">
            <Toggle checked={published} onChange={setPublished} label="Опубликована" />
          </div>
        </div>
        <Textarea
          label="Краткое описание (для списка)"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-3">
        {blocks.length === 0 ? (
          <div className="rounded-panel border border-dashed border-hairline py-8 text-center text-sm text-ink-muted">
            Добавьте первый блок содержимого ниже.
          </div>
        ) : null}
        <DndContext id="kb-blocks" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b._id)} strategy={verticalListSortingStrategy}>
            {blocks.map((b) => (
              <BlockEditor
                key={b._id}
                id={b._id}
                block={b.block}
                onChange={(next) => update(b._id, next)}
                onRemove={() => remove(b._id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Добавление блоков — без внешней обводки. */}
      <div>
        <div className="text-xs uppercase tracking-tight text-ink-subtle mb-2">Добавить блок</div>
        <div className="flex flex-wrap gap-2">
          <AddButton icon={<Type className="h-4 w-4" />} label="Текст" onClick={() => add({ type: "text", html: "" })} />
          <AddButton icon={<ImageIcon className="h-4 w-4" />} label="Фото" onClick={() => add({ type: "image", key: "" })} />
          <AddButton icon={<Video className="h-4 w-4" />} label="Видео" onClick={() => add({ type: "video", provider: "youtube", embedUrl: "" })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sticky bottom-4">
        <span className="mr-auto">
          {dirty || autosavedAt ? (
            <span className="rounded-btn bg-white/90 px-2 py-1 text-xs text-ink-muted">
              {dirty
                ? "Есть несохранённые изменения — автосохранение раз в 5 минут"
                : `Автосохранено в ${timeLabel(autosavedAt!)}`}
            </span>
          ) : null}
        </span>
        {articleId ? (
          <Button variant="ghostDanger" icon={<Trash2 className="h-4 w-4" />} onClick={removeArticle}>
            Удалить
          </Button>
        ) : null}
        <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={save}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function AddButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3.5 h-10 text-sm transition-colors hover:border-accent hover:text-accent"
    >
      {icon}
      {label}
    </button>
  );
}

function BlockEditor({
  id,
  block,
  onChange,
  onRemove,
}: {
  id: string;
  block: KbBlock;
  onChange: (next: KbBlock) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const label = block.type === "text" ? "Текст" : block.type === "image" ? "Фото" : "Видео";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={
        "group relative rounded-panel bg-bg transition-shadow " +
        (isDragging ? "z-10 opacity-90 ring-2 ring-accent/40 shadow-lg" : "")
      }
    >
      <div className="flex items-center gap-2 mb-2">
        {/* touch-none: на тач-экране жест по ручке двигает блок, а не страницу. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          title="Перетащите, чтобы изменить порядок"
          aria-label={`Переместить блок «${label}»`}
          className="grid h-9 w-9 place-items-center rounded-btn text-ink-subtle cursor-grab touch-none active:cursor-grabbing hover:bg-surface-muted"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</span>
        <button
          type="button"
          onClick={onRemove}
          title="Удалить блок"
          className="ml-auto grid h-7 w-7 place-items-center rounded-btn text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {block.type === "text" ? (
        <RichTextEditor value={block.html} onChange={(html) => onChange({ type: "text", html })} />
      ) : null}
      {block.type === "image" ? <ImageEditor block={block} onChange={onChange} /> : null}
      {block.type === "video" ? <VideoEditor block={block} onChange={onChange} /> : null}
    </div>
  );
}

/* ─────────────────────── Визуальный редактор текста ─────────────────────── */

function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const savedRange = React.useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkText, setLinkText] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");

  // Инициализируем содержимое один раз, чтобы не сбрасывать курсор при вводе.
  React.useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? "");

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertHTML = (html: string) => {
    ref.current?.focus();
    restoreRange();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  const insertChecklist = () =>
    insertHTML('<ul class="kb-checklist"><li class="kb-check">Пункт</li></ul><p><br></p>');

  const insertQuote = () => insertHTML("<blockquote>Введите цитату</blockquote><p><br></p>");

  const clearFormatting = () => {
    ref.current?.focus();
    document.execCommand("removeFormat");
    document.execCommand("formatBlock", false, "<p>");
    emit();
  };

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreRange = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const openLink = () => {
    saveRange();
    setLinkText(savedRange.current?.toString() ?? "");
    setLinkUrl("");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const text = linkText.trim();
    let url = linkUrl.trim();
    if (!url) {
      setLinkOpen(false);
      return;
    }
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) url = "https://" + url;
    const safeText = (text || url).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeUrl = url.replace(/"/g, "%22");
    insertHTML(`<a href="${safeUrl}">${safeText}</a>&nbsp;`);
    setLinkOpen(false);
  };

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const btn =
    "grid h-9 w-9 place-items-center rounded-btn text-ink transition-colors hover:bg-surface-muted";

  return (
    <div className="rounded-panel border border-hairline bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline p-1.5">
        <button type="button" title="Заголовок" className={btn} onMouseDown={keep} onClick={() => exec("formatBlock", "<h2>")}><Heading2 className="h-4 w-4" /></button>
        <button type="button" title="Жирный" className={btn} onMouseDown={keep} onClick={() => exec("bold")}><Bold className="h-4 w-4" /></button>
        <button type="button" title="Курсив" className={btn} onMouseDown={keep} onClick={() => exec("italic")}><Italic className="h-4 w-4" /></button>
        <button type="button" title="Зачёркнутый" className={btn} onMouseDown={keep} onClick={() => exec("strikeThrough")}><Strikethrough className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-hairline" />
        <button type="button" title="Ссылка" className={btn} onMouseDown={keep} onClick={openLink}><Link2 className="h-4 w-4" /></button>
        <button type="button" title="Цитата" className={btn} onMouseDown={keep} onClick={insertQuote}><Quote className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-hairline" />
        <button type="button" title="Чек-лист" className={btn} onMouseDown={keep} onClick={insertChecklist}><ListChecks className="h-4 w-4" /></button>
        <button type="button" title="Маркированный список" className={btn} onMouseDown={keep} onClick={() => exec("insertUnorderedList")}><List className="h-4 w-4" /></button>
        <button type="button" title="Нумерованный список" className={btn} onMouseDown={keep} onClick={() => exec("insertOrderedList")}><ListOrdered className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-hairline" />
        <button type="button" title="Очистить форматирование" className={btn} onMouseDown={keep} onClick={clearFormatting}><Eraser className="h-4 w-4" /></button>
      </div>

      {linkOpen ? (
        <div className="flex flex-col gap-2 border-b border-hairline bg-surface-muted/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Вставить ссылку</span>
            <button type="button" onClick={() => setLinkOpen(false)} className="grid h-7 w-7 place-items-center rounded-btn text-ink-muted hover:bg-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Текст ссылки" />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyLink()}
              placeholder="https://адрес"
            />
          </div>
          <div>
            <Button size="sm" onClick={applyLink}>Вставить</Button>
          </div>
        </div>
      ) : null}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder="Введите текст…"
        className="kb-content kb-editor min-h-[120px] px-4 py-3 text-[14.5px] leading-relaxed focus:outline-none empty:before:text-ink-subtle empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

/* ─────────────────────────────── Фото ─────────────────────────────── */

function ImageEditor({
  block,
  onChange,
}: {
  block: Extract<KbBlock, { type: "image" }>;
  onChange: (next: KbBlock) => void;
}) {
  const [uploading, setUploading] = React.useState(false);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/kb/upload", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось загрузить");
      return;
    }
    const j = await res.json();
    onChange({ ...block, key: j.key });
  }

  return (
    <div className="space-y-3">
      {block.key ? (
        <div className="rounded-panel border border-hairline overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/kb/media?key=${encodeURIComponent(block.key)}`} alt={block.alt ?? ""} className="w-full" />
        </div>
      ) : (
        <div className="rounded-panel border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">
          Файл не выбран
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 rounded-btn border border-hairline px-3.5 h-10 text-sm cursor-pointer transition-colors hover:border-accent hover:text-accent">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {block.key ? "Заменить" : "Загрузить"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <Input
        label="Подпись (необязательно)"
        value={block.caption ?? ""}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
      />
    </div>
  );
}

/* ─────────────────────────────── Видео ─────────────────────────────── */

function VideoEditor({
  block,
  onChange,
}: {
  block: Extract<KbBlock, { type: "video" }>;
  onChange: (next: KbBlock) => void;
}) {
  const [raw, setRaw] = React.useState("");

  function applyUrl() {
    const parsed = parseVideoEmbed(raw);
    if (!parsed) {
      toast.error("Не удалось распознать ссылку. Поддерживаются YouTube, Vimeo, RuTube, VK.");
      return;
    }
    onChange({ ...block, provider: parsed.provider, embedUrl: parsed.embedUrl });
    toast.success("Видео добавлено");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <Input
            label="Ссылка на видео (YouTube, Vimeo, RuTube, VK)"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </div>
        <Button variant="secondary" onClick={applyUrl}>
          Применить
        </Button>
      </div>
      {block.embedUrl ? (
        <div className="relative w-full overflow-hidden rounded-panel border border-hairline" style={{ paddingTop: "56.25%" }}>
          <iframe src={block.embedUrl} title="Видео" className="absolute inset-0 h-full w-full" allowFullScreen />
        </div>
      ) : null}
      <Input
        label="Подпись (необязательно)"
        value={block.caption ?? ""}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
      />
    </div>
  );
}
