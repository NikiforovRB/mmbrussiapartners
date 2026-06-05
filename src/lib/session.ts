import "server-only";
import { auth } from "./auth";
import { hasPermission, type PermissionKey } from "./permissions";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

export async function requireApprovedUser() {
  const session = await requireSession();
  if (session.user.status !== "APPROVED") {
    throw new Error("ACCOUNT_NOT_APPROVED");
  }
  return session;
}

export async function requirePermission(perm: PermissionKey | PermissionKey[]) {
  const session = await requireApprovedUser();
  if (!hasPermission(session.user.permissions, perm, session.user.isSuperAdmin)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireApprovedUser();
  if (!session.user.isSuperAdmin) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
