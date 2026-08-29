"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { cabinetUrl } from "@/lib/cabinet-origin";

/**
 * Выход с уводом на публичный адрес кабинета. Отдельный компонент нужен
 * серверным экранам вроде «аккаунт ожидает одобрения»: голая форма с POST
 * на /api/auth/signout уходит без CSRF-токена, и NextAuth её отклоняет.
 */
export function SignOutButton({
  children = "Выйти",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [pending, setPending] = React.useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut({ redirect: false });
        window.location.assign(cabinetUrl("/"));
      }}
      className={className}
    >
      {children}
    </button>
  );
}
