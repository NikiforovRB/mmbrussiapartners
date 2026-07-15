import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import type { PermissionKey } from "./permissions";

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
  refreshedAt?: number;
};

const JWT_REFRESH_MS = 60_000;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

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

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          status: user.status,
          roleName: user.role.name,
          permissions: user.role.permissions as PermissionKey[],
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
        t.refreshedAt = Date.now();
        return t as typeof token;
      }

      const stale = !t.refreshedAt || Date.now() - t.refreshedAt > JWT_REFRESH_MS;
      if (t.id && (trigger === "update" || stale)) {
        const fresh = await db.user.findUnique({
          where: { id: t.id },
          include: { role: true },
        });
        if (fresh) {
          t.isSuperAdmin = fresh.isSuperAdmin;
          t.status = fresh.status;
          t.roleName = fresh.role.name;
          t.permissions = fresh.role.permissions as PermissionKey[];
        }
        t.refreshedAt = Date.now();
      }
      return t as typeof token;
    },
    session({ session, token }) {
      const t = token as AuthJwt;
      if (t && session.user) {
        session.user.id = t.id ?? "";
        session.user.isSuperAdmin = !!t.isSuperAdmin;
        session.user.status = t.status ?? "";
        session.user.roleName = t.roleName ?? "";
        session.user.permissions = t.permissions ?? [];
      }
      return session;
    },
  },
});

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
