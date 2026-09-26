import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { forbidden, unauthenticated } from "./api";
import { hasAdminScope, hasPermission, type PermissionKey } from "./permissions";

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

/**
 * Сессия администратора для серверной страницы админки. Раскладка (admin)
 * проверяет то же самое, но полагаться на неё нельзя: раскладка не
 * перерисовывается при переходах, а страница выдаёт данные всей сети. Права
 * вида licenses.view есть и у представителя, поэтому сначала — admin scope.
 */
export async function requireAdminPage(perm?: PermissionKey | PermissionKey[]) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  if (session.user.status === "PENDING") redirect("/dealer");
  if (session.user.status !== "APPROVED") redirect("/login?callbackUrl=/admin");
  if (!hasAdminScope(session.user.permissions, session.user.isSuperAdmin)) redirect("/dealer");
  if (perm && !hasPermission(session.user.permissions, perm, session.user.isSuperAdmin)) {
    redirect("/admin");
  }
  return session;
}
