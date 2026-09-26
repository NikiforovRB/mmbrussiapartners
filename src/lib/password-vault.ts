import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Обратимое хранение паролей представителей: администратор видит пароль в
 * карточке. Шифр — AES-256-GCM, ключ (32 байта в base64) только в окружении
 * сервера: DEALER_PASSWORD_KEY. Для входа по-прежнему проверяется bcrypt-хэш.
 *
 * Шифртекст привязан к id пользователя (AAD): перенесённый в чужую строку, он
 * не расшифруется.
 */

const FORMAT = "v1";

function vaultKey(): Buffer | null {
  const raw = process.env.DEALER_PASSWORD_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function isPasswordVaultConfigured(): boolean {
  return vaultKey() !== null;
}

/** Шифрует пароль; null — ключ не задан, храним только хэш. */
export function sealPassword(userId: string, plain: string): string | null {
  const key = vaultKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64"));
  return [FORMAT, ...parts].join(":");
}

/** Расшифровывает пароль; null — нет копии, нет ключа или ключ сменился. */
export function openPassword(userId: string, sealed: string | null | undefined): string | null {
  const key = vaultKey();
  if (!key || !sealed) return null;
  const [format, iv, tag, encrypted] = sealed.split(":");
  if (format !== FORMAT || !iv || !tag || !encrypted) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
