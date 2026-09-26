import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { hasAdminScope, type PermissionKey } from "./permissions";
import { isPasswordVaultConfigured, openPassword, sealPassword } from "./password-vault";
import { rateLimit, clientIp } from "./rate-limit";
import { trackUserIp } from "./user-ips";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      isSuperAdmin: boolean;
      status: string;
      roleName: string;
      permissions: PermissionKey[];
    } & DefaultSession["user"];
  }
}

type AuthJwt = {
  id?: string;
  isSuperAdmin?: boolean;
  status?: string;
  roleName?: string;
  permissions?: PermissionKey[];
  /** Совпадает с User.sessionVersion; увеличение в базе отзывает все выданные сессии. */
  sessionVersion?: number;
  refreshedAt?: number;
};

/**
 * Как часто токен сверяется с базой. JWT нельзя отозвать мгновенно: блокировка,
 * смена прав или отзыв сессий вступают в силу не позже чем через этот интервал.
 */
const JWT_REFRESH_MS = 30_000;

const BLOCKED_STATUSES = new Set(["SUSPENDED", "REJECTED"]);

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  // За обратным прокси приложение видит http, поэтому признак защищённого
  // соединения берём из NEXTAUTH_URL: иначе имя cookie сессии зависело бы от
  // того, прислал ли прокси X-Forwarded-Proto.
  trustHost: true,
  useSecureCookies: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds, req) => {
        // Анти-брутфорс: ограничиваем попытки по IP и по email (10 минут).
        const ip = req?.headers ? clientIp(req.headers) : "unknown";
        if (!(await rateLimit(`login-ip:${ip}`, { limit: 15, windowMs: 10 * 60_000 })).ok) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const emailKey = `login-email:${email.toLowerCase().trim()}`;
        if (!(await rateLimit(emailKey, { limit: 8, windowMs: 10 * 60_000 })).ok) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { role: true },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        if (user.status === "REJECTED" || user.status === "SUSPENDED") {
          throw new Error(user.status === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_REJECTED");
        }

        // Из bcrypt-хэша пароль не восстановить: копия для администратора
        // появляется при входе и обновляется, если пароль сменили в обход кабинета.
        const permissions = user.role.permissions as PermissionKey[];
        const refreshCopy =
          isPasswordVaultConfigured() &&
          !user.isSuperAdmin &&
          !hasAdminScope(permissions) &&
          openPassword(user.id, user.passwordEncrypted) !== password;

        await db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            ...(ip !== "unknown" ? { lastLoginIp: ip } : {}),
            ...(refreshCopy ? { passwordEncrypted: sealPassword(user.id, password) } : {}),
          },
        });
        // Гео-сервис не должен задерживать вход — адрес пишем в фоне.
        void trackUserIp(user.id, ip, { force: true });

        return {
          id: user.id,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          status: user.status,
          roleName: user.role.name,
          permissions,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      const t = token as AuthJwt & Record<string, unknown>;
      if (user) {
        const u = user as Record<string, unknown>;
        t.id = u.id as string;
        t.isSuperAdmin = u.isSuperAdmin as boolean;
        t.status = u.status as string;
        t.roleName = u.roleName as string;
        t.permissions = (u.permissions as PermissionKey[]) ?? [];
        t.sessionVersion = (u.sessionVersion as number) ?? 0;
        t.refreshedAt = Date.now();
        return t as typeof token;
      }

      const stale = !t.refreshedAt || Date.now() - t.refreshedAt > JWT_REFRESH_MS;
      if (t.id && (trigger === "update" || stale)) {
        const fresh = await db.user.findUnique({
          where: { id: t.id },
          include: { role: true },
        });
        // null сбрасывает cookie сессии: пользователь удалён, заблокирован
        // или его сессии отозваны (сменён пароль, «Завершить сеансы»).
        if (
          !fresh ||
          BLOCKED_STATUSES.has(fresh.status) ||
          fresh.sessionVersion !== (t.sessionVersion ?? 0)
        ) {
          return null;
        }
        t.isSuperAdmin = fresh.isSuperAdmin;
        t.status = fresh.status;
        t.roleName = fresh.role.name;
        t.permissions = fresh.role.permissions as PermissionKey[];
        t.refreshedAt = Date.now();
      }
      return t as typeof token;
    },
    session({ session, token }) {
      const t = token as AuthJwt;
      if (t && session.user) {
        // Права действуют только у одобренной учётной записи: проверки вида
        // hasPermission(session.user.permissions, …) отказывают остальным сами.
        const approved = t.status === "APPROVED";
        session.user.id = t.id ?? "";
        session.user.isSuperAdmin = approved && !!t.isSuperAdmin;
        session.user.status = t.status ?? "";
        session.user.roleName = t.roleName ?? "";
        session.user.permissions = approved ? (t.permissions ?? []) : [];
      }
      return session;
    },
  },
});

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
