import "server-only";
import sanitizeHtmlLib from "sanitize-html";
import { isAllowedEmbed, type KbBlock, type VideoProvider } from "./knowledge";

/**
 * Санитизация форматированного HTML из визуального редактора базы знаний.
 * Разрешаем ограниченный набор тегов и атрибутов — достаточно для заголовков,
 * списков, чек-листов, цитат, ссылок и выделения, но без script/iframe/style,
 * inline-обработчиков и произвольных схем. Делает безопасным рендер через
 * dangerouslySetInnerHTML.
 */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  const clean = sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "br", "b", "strong", "i", "em", "s", "strike", "u",
      "h2", "h3", "ul", "ol", "li", "blockquote", "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      ul: ["class"],
      ol: ["class"],
      li: ["class"],
    },
    allowedClasses: {
      ul: ["kb-checklist"],
      ol: ["kb-checklist"],
      li: ["kb-check", "kb-check--done"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      strike: "s",
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https?:\/\//i.test(href);
        return {
          tagName: "a",
          attribs: external
            ? { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" }
            : attribs,
        };
      },
    },
  }).trim();
  return clean;
}

type RawBlock = Record<string, unknown>;

/** Приводит любой сохранённый блок (в т.ч. старого формата) к тексту-HTML. */
function legacyToHtml(b: RawBlock): string | null {
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  switch (b.type) {
    case "heading":
      return `<h2>${esc(b.text)}</h2>`;
    case "paragraph":
      return typeof b.html === "string" ? b.html : esc(b.text);
    case "quote":
      return `<blockquote>${typeof b.html === "string" ? b.html : esc(b.text)}</blockquote>`;
    case "list": {
      const items = Array.isArray(b.items) ? b.items : [];
      const lis = items.map((i) => `<li>${esc(i)}</li>`).join("");
      return b.ordered ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`;
    }
    default:
      return null;
  }
}

/**
 * Санитизация массива блоков перед сохранением/рендером. Возвращает чистые
 * блоки нового формата. Блоки старого формата конвертируются в text.
 */
export function sanitizeBlocks(input: unknown): KbBlock[] {
  if (!Array.isArray(input)) return [];
  const out: KbBlock[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as RawBlock;

    if (b.type === "text") {
      const html = sanitizeRichHtml(typeof b.html === "string" ? b.html : "");
      if (html) out.push({ type: "text", html });
      continue;
    }
    if (b.type === "image") {
      if (typeof b.key === "string" && b.key) {
        out.push({
          type: "image",
          key: b.key,
          ...(typeof b.alt === "string" && b.alt ? { alt: b.alt.slice(0, 300) } : {}),
          ...(typeof b.caption === "string" && b.caption ? { caption: b.caption.slice(0, 300) } : {}),
        });
      }
      continue;
    }
    if (b.type === "video") {
      const provider = b.provider as VideoProvider;
      const embedUrl = typeof b.embedUrl === "string" ? b.embedUrl : "";
      if (isAllowedEmbed(provider, embedUrl)) {
        out.push({
          type: "video",
          provider,
          embedUrl,
          ...(typeof b.caption === "string" && b.caption ? { caption: b.caption.slice(0, 300) } : {}),
        });
      }
      continue;
    }

    // Старый формат (heading/paragraph/quote/list) → text.
    const legacy = legacyToHtml(b);
    if (legacy) {
      const html = sanitizeRichHtml(legacy);
      if (html) out.push({ type: "text", html });
    }
  }
  return out;
}

/** Возвращает блоки статьи из Json-поля Prisma (с конвертацией старого формата). */
export function readBlocks(value: unknown): KbBlock[] {
  if (Array.isArray(value)) return sanitizeBlocks(value);
  return [];
}
