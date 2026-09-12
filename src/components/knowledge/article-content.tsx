import * as React from "react";
import type { KbBlock } from "@/lib/knowledge";

function mediaUrl(key: string) {
  return `/api/kb/media?key=${encodeURIComponent(key)}`;
}

/**
 * Рендер контента статьи из блоков. HTML текстовых блоков уже прошёл серверную
 * санитизацию (sanitizeRichHtml), поэтому dangerouslySetInnerHTML безопасен.
 */
export function ArticleContent({ blocks }: { blocks: KbBlock[] }) {
  if (blocks.length === 0) {
    return <p className="text-ink-muted">В статье пока нет содержимого.</p>;
  }
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "text":
            return (
              <div
                key={i}
                className="kb-content text-[15px] leading-relaxed text-ink"
                dangerouslySetInnerHTML={{ __html: b.html }}
              />
            );
          case "image":
            return (
              <figure key={i} className="my-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(b.key)}
                  alt={b.alt ?? ""}
                  className="w-full rounded-panel border border-hairline"
                />
                {b.caption ? (
                  <figcaption className="mt-1.5 text-xs text-ink-subtle text-center">{b.caption}</figcaption>
                ) : null}
              </figure>
            );
          case "video":
            return (
              <figure key={i} className="my-2">
                <div className="relative w-full overflow-hidden rounded-panel border border-hairline" style={{ paddingTop: "56.25%" }}>
                  <iframe
                    src={b.embedUrl}
                    title={b.caption ?? "Видео"}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                {b.caption ? (
                  <figcaption className="mt-1.5 text-xs text-ink-subtle text-center">{b.caption}</figcaption>
                ) : null}
              </figure>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
