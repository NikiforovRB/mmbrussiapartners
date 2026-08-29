import Link from "next/link";

/**
 * Ссылка «Войти» на публичной странице: вошедшего ведёт сразу в его кабинет.
 *
 * Адрес приходит готовым с сервера. Раньше компонент сам звал useSession(),
 * из-за чего публичная главная тянула /api/auth/session на каждой загрузке —
 * по разу на каждую ссылку — и падала при рендере вне SessionProvider.
 */
export function LoginLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
