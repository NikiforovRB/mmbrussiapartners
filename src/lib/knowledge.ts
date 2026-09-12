import { z } from "zod";

/**
 * Контент статьи хранится блоками трёх типов:
 *   text  — форматированный HTML из визуального редактора (заголовки, списки,
 *           цитаты, ссылки, выделение). Санитизируется на сервере перед
 *           сохранением и рендером (см. knowledge-server.ts);
 *   image — ключ объекта в S3 + подпись;
 *   video — нормализованный embed-URL с разрешённого хоста + подпись.
 *
 * Этот модуль безопасен для клиента (без server-only зависимостей): типы,
 * разбор ссылок на видео, slug и превью.
 */

export type KbBlock =
  | { type: "text"; html: string }
  | { type: "image"; key: string; alt?: string; caption?: string }
  | { type: "video"; provider: VideoProvider; embedUrl: string; caption?: string };

export type VideoProvider = "youtube" | "vimeo" | "rutube" | "vk";

const VIDEO_HOSTS: Record<VideoProvider, string> = {
  youtube: "www.youtube.com",
  vimeo: "player.vimeo.com",
  rutube: "rutube.ru",
  vk: "vk.com",
};

/** Разбирает ссылку на видео и возвращает безопасный embed-URL или null. */
export function parseVideoEmbed(raw: string): { provider: VideoProvider; embedUrl: string } | null {
  const url = raw.trim();
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (id) return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : "");
    if (id) return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  // RuTube
  if (host === "rutube.ru") {
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("video");
    const id = idx >= 0 ? parts[idx + 1] : parts.includes("embed") ? parts[parts.indexOf("embed") + 1] : "";
    if (id) return { provider: "rutube", embedUrl: `https://rutube.ru/play/embed/${encodeURIComponent(id)}` };
  }

  // VK (vk.com/video-OID_ID или vkvideo.ru/...)
  if (host === "vk.com" || host === "vkvideo.ru" || host === "m.vk.com") {
    const m = u.pathname.match(/video(-?\d+)_(\d+)/);
    if (m) {
      return {
        provider: "vk",
        embedUrl: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`,
      };
    }
  }

  return null;
}

/** Проверяет, что embed-URL ведёт на разрешённый хост провайдера. */
export function isAllowedEmbed(provider: VideoProvider, embedUrl: string): boolean {
  try {
    const u = new URL(embedUrl);
    return u.protocol === "https:" && u.hostname.replace(/^www\./, "") === VIDEO_HOSTS[provider].replace(/^www\./, "");
  } catch {
    return false;
  }
}

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), html: z.string() }),
  z.object({ type: z.literal("image"), key: z.string(), alt: z.string().optional(), caption: z.string().optional() }),
  z.object({
    type: z.literal("video"),
    provider: z.enum(["youtube", "vimeo", "rutube", "vk"]),
    embedUrl: z.string(),
    caption: z.string().optional(),
  }),
]);

export const blocksSchema = z.array(blockSchema).max(300);

export function stripTags(s: string): string {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "article";
}

/** Короткое текстовое превью статьи по её блокам. */
export function articlePreview(blocks: KbBlock[], max = 180): string {
  for (const b of blocks) {
    if (b.type === "text") {
      const text = stripTags(b.html).trim();
      if (text) return text.length > max ? `${text.slice(0, max)}…` : text;
    }
  }
  return "";
}
