import Link from "next/link";
import { Ban } from "lucide-react";
import { formatRuDateTime, parseMoscowLocal } from "@/lib/dates";
import { blackoutBlockReason, type GenerationSettings } from "@/lib/site-settings";

/** Пока действует запрет генерации, администраторы видят его на каждой странице. */
export function GenerationBlockedNotice({
  settings,
  canEdit,
}: {
  settings: GenerationSettings;
  canEdit: boolean;
}) {
  if (!blackoutBlockReason(settings)) return null;
  const end = settings.blackoutEnd ? parseMoscowLocal(settings.blackoutEnd) : null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-soft-danger px-4 py-2.5 text-sm text-strong-danger">
      <Ban className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Генерация лицензий для представителей запрещена{" "}
        {end ? `до ${formatRuDateTime(end)} МСК` : "без даты окончания — до ручного отключения"}.
      </span>
      {canEdit ? (
        <Link href="/admin/settings?tab=generation" className="underline underline-offset-2 hover:no-underline">
          Изменить
        </Link>
      ) : null}
    </div>
  );
}
