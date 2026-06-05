"use client";

import { useSession } from "next-auth/react";
import { hasPermission, requireAny, type PermissionKey } from "@/lib/permissions";

export function usePermissions() {
  const { data: session, status } = useSession();
  const permissions = session?.user?.permissions ?? [];
  const isSuperAdmin = !!session?.user?.isSuperAdmin;

  return {
    loaded: status !== "loading",
    isSuperAdmin,
    permissions,
    can: (required: PermissionKey | PermissionKey[]) =>
      hasPermission(permissions, required, isSuperAdmin),
    canAny: (any: PermissionKey[]) => requireAny(permissions, any, isSuperAdmin),
  };
}
