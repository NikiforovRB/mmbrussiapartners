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

type UnreadState = readonly [number, React.Dispatch<React.SetStateAction<number>>];

const CabinetUserContext = React.createContext<CabinetUser | null>(null);
const UnreadContext = React.createContext<UnreadState | null>(null);

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
  const [unread, setUnread] = React.useState(value.unreadCount);
  // Раскладка перерисовывается только при router.refresh() — тогда число с
  // сервера свежее и заменяет локальное.
  React.useEffect(() => setUnread(value.unreadCount), [value.unreadCount]);
  const unreadState = React.useMemo<UnreadState>(() => [unread, setUnread], [unread]);

  return (
    <CabinetUserContext.Provider value={value}>
      <UnreadContext.Provider value={unreadState}>{children}</UnreadContext.Provider>
    </CabinetUserContext.Provider>
  );
}

export function useCabinetUser(): CabinetUser | null {
  return React.useContext(CabinetUserContext);
}

/**
 * Счётчик непрочитанных уведомлений. Хранится в раскладке: шапка монтируется
 * заново на каждой странице, и собственное состояние у неё сбрасывалось бы к
 * числу из первого рендера раскладки — прочитанные снова считались бы новыми.
 */
export function useUnreadCount(fallback: number): UnreadState {
  const shared = React.useContext(UnreadContext);
  const [local, setLocal] = React.useState(fallback);
  return shared ?? [local, setLocal];
}
