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
import type { SupportChannel } from "@/lib/site-settings";

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
      className="group flex items-center gap-3 rounded-panel border border-hairline bg-white px-4 py-3.5 transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
