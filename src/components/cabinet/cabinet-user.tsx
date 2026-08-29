"use client";

import * as React from "react";

export type CabinetUser = {
  name: string;
  email: string;
  role: string;
  /** Подписанная ссылка на аватар, полученная на сервере. */
  avatarUrl: string | null;
  /** Корень кабинета: /admin или /dealer. */
  basePath: string;
  /** Непрочитанные уведомления на момент рендера страницы. */
  unreadCount: number;
  permissions: string[];
  isSuperAdmin: boolean;
};

const CabinetUserContext = React.createContext<CabinetUser | null>(null);

/**
 * Раскладка кабинета уже читает пользователя из базы, поэтому шапке незачем
 * повторно дёргать /api/auth/session и /api/profile/avatar на каждой странице —
 * всё нужное приходит сюда с сервера.
 */
export function CabinetUserProvider({
  value,
  children,
}: {
  value: CabinetUser;
  children: React.ReactNode;
}) {
  return <CabinetUserContext.Provider value={value}>{children}</CabinetUserContext.Provider>;
}

export function useCabinetUser(): CabinetUser | null {
  return React.useContext(CabinetUserContext);
}
