"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { getCabinetPath } from "@/lib/cabinet-path";

export function LoginLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { data: session } = useSession();
  const href = session?.user ? getCabinetPath(session.user) : "/login";

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
