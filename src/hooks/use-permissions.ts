"use client";

import { useSession } from "next-auth/react";
import { useCabinetUser } from "@/components/cabinet/cabinet-user";
import { hasPermission, requireAny, type PermissionKey } from "@/lib/permissions";

/**
 * Права текущего пользователя.
 *
 * Внутри кабинета берём их из серверного контекста раскладки — так страница
 * не ждёт ответа /api/auth/session и не мигает выключенными кнопками.
 * Вне кабинета (публичные страницы) остаётся обычная клиентская сессия.
 */
export function usePermissions() {
  const cabinet = useCabinetUser();
  const { data: session, status } = useSession();

  const permissions = cabinet?.permissions ?? session?.user?.permissions ?? [];
  const isSuperAdmin = cabinet?.isSuperAdmin ?? !!session?.user?.isSuperAdmin;

  return {
    loaded: cabinet != null || status !== "loading",
    isSuperAdmin,
    permissions,
    can: (required: PermissionKey | PermissionKey[]) =>
      hasPermission(permissions, required, isSuperAdmin),
    canAny: (any: PermissionKey[]) => requireAny(permissions, any, isSuperAdmin),
  };
}
