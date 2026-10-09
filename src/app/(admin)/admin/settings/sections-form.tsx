import { BookOpen, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionVisibilityToggle } from "@/components/settings/section-visibility-toggle";
import type { CabinetSections } from "@/lib/site-settings";

export function SectionsForm({ initial }: { initial: CabinetSections }) {
  return (
    <Card className="max-w-2xl">
      <div className="font-display text-lg tracking-tight mb-1">Разделы кабинета дилера</div>
      <p className="text-sm text-ink-muted mb-5">
        Выключенный раздел пропадает из меню дилеров, а его страницы перестают открываться. В админке
        разделы остаются. Изменения сохраняются сразу.
      </p>
      <div className="space-y-5">
        <SectionVisibilityToggle
          section="legacyLk"
          initial={initial.legacyLk}
          label={
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" /> ЛК DriveMods
            </span>
          }
          description="История лицензий и оплат из store.drivemods.ru. Пункт виден только тем, у кого есть такие записи."
        />
        <SectionVisibilityToggle
          section="knowledge"
          initial={initial.knowledge}
          label={
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> База знаний
            </span>
          }
          description="Опубликованные статьи и инструкции."
        />
      </div>
    </Card>
  );
}
