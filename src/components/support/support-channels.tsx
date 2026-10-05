import * as React from "react";
import {
  Send,
  MessageCircle,
  Phone,
  Mail,
  MessageSquare,
  LifeBuoy,
  Link as LinkIcon,
} from "lucide-react";
import type { SupportChannel, SupportSettings } from "@/lib/site-settings";

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  telegram: Send,
  whatsapp: MessageCircle,
  phone: Phone,
  mail: Mail,
  message: MessageSquare,
  help: LifeBuoy,
  link: LinkIcon,
};

/**
 * Иконка канала связи. Если заданы картинки — показываем их (с заменой на
 * hover-вариант при наведении на карточку). Иначе — пресет-иконка lucide.
 */
export function SupportChannelIcon({ channel }: { channel: SupportChannel }) {
  if (channel.iconUrl) {
    return (
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={channel.iconUrl}
          alt=""
          className="h-6 w-6 object-contain transition-opacity group-hover:opacity-0"
        />
        {channel.iconHoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.iconHoverUrl}
            alt=""
            className="absolute inset-0 h-6 w-6 object-contain opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </span>
    );
  }
  const Icon = PRESET_ICONS[channel.icon ?? "link"] ?? LinkIcon;
  return <Icon className="h-5 w-5 shrink-0" />;
}

/** Карточка-ссылка канала связи с эффектом наведения. */
export function SupportLinkCard({ channel }: { channel: SupportChannel }) {
  return (
    <a
      href={channel.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-panel border border-hairline bg-surface px-4 py-3.5 transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      <span className="text-ink-muted transition-colors group-hover:text-accent">
        <SupportChannelIcon channel={channel} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink group-hover:text-accent">{channel.label}</span>
        <span className="block truncate text-xs text-ink-subtle">{channel.url}</span>
      </span>
    </a>
  );
}

/** Раздел «Техподдержка»: вступление, каналы связи и требования. */
export function SupportOverview({ support, empty }: { support: SupportSettings; empty: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      {support.intro?.trim() ? <p className="text-sm text-ink-muted mb-5">{support.intro}</p> : null}

      <div className="flex items-center gap-2 mb-4">
        <LifeBuoy className="h-5 w-5 text-accent" />
        <div className="font-display text-lg tracking-tight">Мы на связи</div>
      </div>
      {support.channels.length === 0 ? (
        <div className="rounded-panel border border-hairline py-8 text-center text-sm text-ink-muted">{empty}</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {support.channels.map((c, i) => (
            <SupportLinkCard key={i} channel={c} />
          ))}
        </div>
      )}

      {support.requirements?.trim() ? (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-ink-muted mb-2">Требования и примечания</div>
          <p className="text-sm text-ink-muted whitespace-pre-line">{support.requirements}</p>
        </div>
      ) : null}
    </div>
  );
}
