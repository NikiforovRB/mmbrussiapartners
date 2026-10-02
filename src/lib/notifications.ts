import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";
import { formatRub } from "./money";
import { escapeTelegramHtml, isTelegramConfigured, telegramApi } from "./telegram";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string | null;
};

export const DEFAULT_SMTP_FROM = "MMB RUSSIA <mail@mmbrussia.ru>";

let cachedTransport: nodemailer.Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function smtpFrom(): string {
  return process.env.SMTP_FROM?.trim() || DEFAULT_SMTP_FROM;
}

function getTransport(): nodemailer.Transporter | null {
  if (cachedTransport) return cachedTransport;
  if (!isSmtpConfigured()) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return cachedTransport;
}

export async function sendEmail({ to, subject, html, text, userId }: SendEmailParams) {
  const transport = getTransport();

  const log = await db.notificationLog.create({
    data: {
      channel: "EMAIL",
      recipient: to,
      subject,
      body: text ?? stripHtml(html),
      userId: userId ?? null,
      status: transport ? "QUEUED" : "FAILED",
      error: transport ? null : "SMTP not configured",
    },
  });

  if (!transport) return { ok: false, reason: "SMTP not configured", logId: log.id };

  try {
    await transport.sendMail({ from: smtpFrom(), to, subject, html, text });
    await db.notificationLog.update({ where: { id: log.id }, data: { status: "SENT" } });
    return { ok: true, logId: log.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: message },
    });
    return { ok: false, reason: message, logId: log.id };
  }
}

/** Сообщение в чат с ботом через воркер Cloudflare (lib/telegram.ts). Текст — HTML Telegram. */
export async function sendTelegram(opts: { chatId: string; text: string; userId?: string | null }) {
  const configured = isTelegramConfigured();
  const log = await db.notificationLog.create({
    data: {
      channel: "TELEGRAM",
      recipient: opts.chatId,
      body: opts.text,
      userId: opts.userId ?? null,
      status: configured ? "QUEUED" : "FAILED",
      error: configured ? null : "Telegram not configured",
    },
  });
  if (!configured) return { ok: false, reason: "Telegram not configured", logId: log.id };

  try {
    await telegramApi("sendMessage", {
      chat_id: opts.chatId,
      text: opts.text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    await db.notificationLog.update({ where: { id: log.id }, data: { status: "SENT" } });
    return { ok: true, logId: log.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
    return { ok: false, reason: message, logId: log.id };
  }
}

/** Письмо-уведомление: заголовок, текст и кнопка в кабинет. */
export function notificationEmailHtml(params: { title: string; body?: string | null; url?: string | null; footer: string }) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; color: #171717;">
      <div style="font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280;">MMB RUSSIA · Партнёрский кабинет</div>
      <h2 style="margin: 12px 0; font-size: 20px; line-height: 1.3;">${escapeHtml(params.title)}</h2>
      ${params.body ? `<p style="margin: 0 0 16px; white-space: pre-line; line-height: 1.5;">${escapeHtml(params.body)}</p>` : ""}
      ${
        params.url
          ? `<p style="margin: 20px 0;"><a href="${escapeHtml(params.url)}" style="display: inline-block; background: #2a9fff; color: #fff; padding: 10px 18px; border-radius: 12px; text-decoration: none;">Открыть в кабинете</a></p>`
          : ""
      }
      <p style="margin-top: 28px; color: #9ca3af; font-size: 12px; line-height: 1.5;">${escapeHtml(params.footer)}</p>
    </div>`;
}

export function notificationTelegramText(params: { title: string; body?: string | null; url?: string | null }) {
  return [
    `<b>${escapeTelegramHtml(params.title)}</b>`,
    params.body ? escapeTelegramHtml(params.body) : null,
    params.url ? `<a href="${escapeTelegramHtml(params.url)}">Открыть в кабинете</a>` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Письмо представителю с фискальным чеком после успешной оплаты.
 * Дублирует экземпляр ОФД (тот уходит на email, указанный в самом чеке) и
 * даёт удобную ссылку прямо в кабинете.
 */
export async function notifyDealerReceipt(params: {
  to: string;
  amount: number;
  licenseNumber?: string | null;
  receiptUrl?: string | null;
  fiscalDocNumber?: string | null;
  userId?: string | null;
}) {
  const amountLabel = formatRub(params.amount);
  const subject = params.licenseNumber
    ? `Чек об оплате · лицензия ${params.licenseNumber}`
    : `Чек об оплате · ${amountLabel}`;
  const rows: string[] = [`<p>Оплата на сумму <strong>${escapeHtml(amountLabel)}</strong> получена.</p>`];
  if (params.licenseNumber) {
    rows.push(`<p>Лицензия: <strong>${escapeHtml(params.licenseNumber)}</strong></p>`);
  }
  if (params.fiscalDocNumber) {
    rows.push(`<p>Фискальный документ № <strong>${escapeHtml(params.fiscalDocNumber)}</strong></p>`);
  }
  if (params.receiptUrl) {
    rows.push(
      `<p><a href="${escapeHtml(params.receiptUrl)}" style="display:inline-block;background:#2a9fff;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;">Открыть чек</a></p>`,
    );
  }
  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin:0 0 12px;">Чек об оплате</h2>
      ${rows.join("\n")}
      <p style="color:#6b7280;font-size:13px;">Услуга по модификации программного обеспечения. Спасибо, что работаете с MMB RUSSIA.</p>
    </div>`;
  return sendEmail({ to: params.to, subject, html, userId: params.userId ?? null });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
