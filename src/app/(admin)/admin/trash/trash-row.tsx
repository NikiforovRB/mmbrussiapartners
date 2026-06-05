"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";

export function TrashRow({ id }: { id: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canRestore = can("licenses.restore");
  const [loading, setLoading] = React.useState(false);

  async function restore() {
    setLoading(true);
    const res = await fetch(`/api/licenses/${id}/restore`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка");
      return;
    }
    toast.success("Восстановлено");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      loading={loading}
      disabled={!canRestore}
      title={canRestore ? undefined : "Нет права на восстановление лицензий"}
      onClick={restore}
      icon={<RotateCcw className="h-4 w-4" />}
    >
      Восстановить
    </Button>
  );
}
