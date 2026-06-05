export function getCabinetPath(user: {
  isSuperAdmin?: boolean;
  roleName?: string;
  status?: string;
}): string {
  if (user.status && user.status !== "APPROVED") {
    return "/dealer";
  }
  if (
    user.isSuperAdmin ||
    user.roleName === "Администратор"
  ) {
    return "/admin";
  }
  return "/dealer";
}
