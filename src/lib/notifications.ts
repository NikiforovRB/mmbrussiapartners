import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string | null;
};

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransport;
}

export async function sendEmail({ to, subject, html, text, userId }: SendEmailParams) {
  const transport = getTransport();
  const from = process.env.SMTP_FROM ?? "MMB RUSSIA <noreply@mmbrussia.ru>";

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
    await transport.sendMail({ from, to, subject, html, text });
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

/**
 * Telegram channel — пока заглушка. Когда понадобится — заполнить
 * TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID и реализовать через Bot API.
 */
export async function sendTelegram(opts: { chatId?: string; text: string; userId?: string | null }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fallbackChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const chatId = opts.chatId ?? fallbackChat;

  const log = await db.notificationLog.create({
    data: {
      channel: "TELEGRAM",
      recipient: chatId ?? "—",
      body: opts.text,
      userId: opts.userId ?? null,
      status: token && chatId ? "QUEUED" : "FAILED",
      error: token && chatId ? null : "Telegram not configured",
    },
  });

  if (!token || !chatId) return { ok: false, reason: "Telegram not configured", logId: log.id };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: opts.text, parse_mode: "HTML" }),
    });
    if (!res.ok) throw new Error(`Telegram API ${res.status}`);
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

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function notifyAdminsLicenseCancelled(params: {
  licenseNumber: string;
  dealerEmail: string;
  reason: string;
  by: string;
}) {
  const subject = `Аннулирована лицензия ${params.licenseNumber}`;
  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin:0 0 12px;">Аннулирована лицензия ${escapeHtml(params.licenseNumber)}</h2>
      <p>Представитель: <strong>${escapeHtml(params.dealerEmail)}</strong></p>
      <p>Инициатор: <strong>${escapeHtml(params.by)}</strong></p>
      <p style="background:#e7ecf6;padding:12px;border-radius:12px;">
        <strong>Причина:</strong><br/>${escapeHtml(params.reason)}
      </p>
    </div>`;

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail) {
    await sendEmail({ to: adminEmail, subject, html });
  }
  await sendTelegram({ text: `${subject}\nПредставитель: ${params.dealerEmail}\nПричина: ${params.reason}` });
}

export async function notifyAdminsCancellationRequest(params: {
  licenseNumber: string;
  dealerEmail: string;
  reason: string;
}) {
  const subject = `Заявка на аннулирование лицензии ${params.licenseNumber}`;
  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin:0 0 12px;">Заявка на аннулирование ${escapeHtml(params.licenseNumber)}</h2>
      <p>Представитель: <strong>${escapeHtml(params.dealerEmail)}</strong> просит аннулировать лицензию.</p>
      <p style="background:#e7ecf6;padding:12px;border-radius:12px;">
        <strong>Причина:</strong><br/>${escapeHtml(params.reason)}
      </p>
      <p>Рассмотрите заявку в разделе «Заявки на аннулирование».</p>
    </div>`;

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail) {
    await sendEmail({ to: adminEmail, subject, html });
  }
  await sendTelegram({
    text: `${subject}\nПредставитель: ${params.dealerEmail}\nПричина: ${params.reason}`,
  });
}

export async function notifyDealerCancellationReviewed(params: {
  licenseNumber: string;
  dealerEmail: string;
  approved: boolean;
  note?: string | null;
  userId?: string | null;
}) {
  const verdict = params.approved ? "одобрена" : "отклонена";
  const subject = `Заявка на аннулирование ${params.licenseNumber} ${verdict}`;
  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px;">
      <h2 style="margin:0 0 12px;">Заявка ${verdict}</h2>
      <p>Лицензия <strong>${escapeHtml(params.licenseNumber)}</strong>: заявка на аннулирование ${verdict}.</p>
      ${params.note ? `<p style="background:#e7ecf6;padding:12px;border-radius:12px;"><strong>Комментарий:</strong><br/>${escapeHtml(params.note)}</p>` : ""}
    </div>`;
  await sendEmail({ to: params.dealerEmail, subject, html, userId: params.userId ?? null });
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
