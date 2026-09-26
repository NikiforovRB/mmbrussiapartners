import "server-only";
import { db } from "@/lib/db";
import { readBlocks } from "@/lib/knowledge-server";
import {
  KB_UNCATEGORIZED,
  articlePreview,
  stripTags,
  type KbBlock,
  type KbTreeNode,
} from "@/lib/knowledge";

export type KbCategoryOption = { id: string; name: string; parentId: string | null };

export type KbListArticle = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryPath: string | null;
  preview: string;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function searchText(title: string, excerpt: string | null, blocks: KbBlock[]): string {
  const parts = [title, excerpt ?? ""];
  for (const b of blocks) {
    if (b.type === "text") parts.push(decodeEntities(stripTags(b.html)));
    else if (b.type === "image") parts.push(b.alt ?? "", b.caption ?? "");
    else parts.push(b.caption ?? "");
  }
  return normalize(parts.join(" "));
}

/** Категории в порядке показа: сначала по sortOrder, затем по дате создания. */
export function loadKnowledgeCategories(): Promise<KbCategoryOption[]> {
  return db.knowledgeCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, parentId: true },
  });
}

/**
 * Данные для раздела «База знаний»: дерево категорий со счётчиками и список
 * статей с учётом выбранной категории или поискового запроса. Поиск идёт по
 * всем категориям сразу — по заголовку, описанию и тексту статьи.
 */
export async function loadKnowledgeBrowser({
  publishedOnly,
  category,
  q,
}: {
  publishedOnly: boolean;
  category?: string;
  q?: string;
}) {
  const [categories, rows] = await Promise.all([
    loadKnowledgeCategories(),
    db.knowledgeArticle.findMany({
      where: publishedOnly ? { published: true } : undefined,
      orderBy: publishedOnly ? [{ createdAt: "desc" }] : [{ updatedAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        blocks: true,
        published: true,
        categoryId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);
  const pathOf = (id: string | null): string | null => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return null;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? `${parent.name} / ${c.name}` : c.name;
  };

  const direct = new Map<string, number>();
  let uncategorized = 0;
  for (const r of rows) {
    if (r.categoryId && byId.has(r.categoryId)) {
      direct.set(r.categoryId, (direct.get(r.categoryId) ?? 0) + 1);
    } else {
      uncategorized += 1;
    }
  }

  const tree: KbTreeNode[] = categories
    .filter((c) => !c.parentId)
    .map((root) => {
      const children = childrenOf(root.id).map((c) => ({
        id: c.id,
        name: c.name,
        count: direct.get(c.id) ?? 0,
        children: [],
      }));
      return {
        id: root.id,
        name: root.name,
        count: (direct.get(root.id) ?? 0) + children.reduce((sum, c) => sum + c.count, 0),
        children,
      };
    });

  const articles = rows.map((r) => ({ row: r, blocks: readBlocks(r.blocks) }));
  const query = (q ?? "").trim().slice(0, 100);
  let active: { id: string; name: string } | null = null;
  let filtered = articles;

  if (query) {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    const inTitle = (title: string) => tokens.every((t) => normalize(title).includes(t));
    filtered = articles
      .filter(({ row, blocks }) => {
        const text = searchText(row.title, row.excerpt, blocks);
        return tokens.every((t) => text.includes(t));
      })
      // Совпадения в заголовке выше совпадений в тексте.
      .sort((a, b) => Number(inTitle(b.row.title)) - Number(inTitle(a.row.title)));
  } else if (category === KB_UNCATEGORIZED) {
    active = { id: KB_UNCATEGORIZED, name: "Без категории" };
    filtered = articles.filter(({ row }) => !row.categoryId || !byId.has(row.categoryId));
  } else if (category && byId.has(category)) {
    active = { id: category, name: pathOf(category) ?? "" };
    const ids = new Set([category, ...childrenOf(category).map((c) => c.id)]);
    filtered = articles.filter(({ row }) => row.categoryId !== null && ids.has(row.categoryId));
  }

  return {
    tree,
    total: rows.length,
    uncategorized,
    query,
    active,
    articles: filtered.map(
      ({ row, blocks }): KbListArticle => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        published: row.published,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        categoryPath: pathOf(row.categoryId),
        preview: row.excerpt || articlePreview(blocks),
      }),
    ),
  };
}

/** Путь категории статьи для заголовков: «Категория / Подкатегория». */
export async function categoryPath(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const c = await db.knowledgeCategory.findUnique({
    where: { id: categoryId },
    select: { name: true, parent: { select: { name: true } } },
  });
  if (!c) return null;
  return c.parent ? `${c.parent.name} / ${c.name}` : c.name;
}
