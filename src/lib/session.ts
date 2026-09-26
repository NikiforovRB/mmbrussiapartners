import "server-only";
import { auth } from "./auth";
import { forbidden, unauthenticated } from "./api";
import { hasPermission, type PermissionKey } from "./permissions";

/**
 * Проверки доступа для API-роутов и серверных действий. Бросают ApiError,
 * который route() превращает в 401/403 с понятным текстом.
 */

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  return session;
}

/**
 * Сессия одобренной учётной записи. Заблокированный, отклонённый или ещё не
 * одобренный пользователь получает 403, даже если роль даёт ему права.
 */
export async function requireApprovedUser() {
  const session = await requireSession();
  if (session.user.status !== "APPROVED") throw forbidden("Учётная запись не активна");
  return session;
}

export async function requirePermission(perm: PermissionKey | PermissionKey[], message?: string) {
  const session = await requireApprovedUser();
  if (!hasPermission(session.user.permissions, perm, session.user.isSuperAdmin)) {
    throw forbidden(message);
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireApprovedUser();
  if (!session.user.isSuperAdmin) throw forbidden();
  return session;
}
