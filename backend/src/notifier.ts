// Notifications on status changes. Enabled via environment variables:
//   - Slack: SLACK_WEBHOOK_URL (incoming webhook)
//   - Email: SMTP_HOST + SMTP_USER + SMTP_PASS + ALERT_EMAIL_TO
// If nothing is configured, it only logs to the console (in index.ts).

import nodemailer, { type Transporter } from 'nodemailer';
import type { Transition } from './store.js';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = String(process.env.SMTP_SECURE).toLowerCase() === 'true';
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;

let transporter: Transporter | null = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL_TO) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const ICON: Record<string, string> = { up: '✅', degraded: '🟠', down: '🔴', unknown: '⚪' };

/** List of active channels, to report at startup. */
export function activeChannels(): string[] {
  const channels: string[] = [];
  if (SLACK_WEBHOOK_URL) channels.push('Slack');
  if (transporter) channels.push(`Email → ${ALERT_EMAIL_TO}`);
  return channels;
}

function headline(t: Transition): string {
  return `${ICON[t.to] ?? ''} ${t.serviceName}: ${t.from} → ${t.to}`;
}

async function sendSlack(t: Transition): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  const color = t.to === 'up' ? '#2ea043' : t.to === 'down' ? '#f85149' : '#d29922';
  const payload = {
    text: headline(t),
    attachments: [
      {
        color,
        fields: [
          { title: 'Service', value: t.serviceName, short: true },
          { title: 'Status', value: `${t.from} → ${t.to}`, short: true },
          { title: 'Reason', value: t.reason, short: true },
          { title: 'Detail', value: t.message, short: false },
        ],
        ts: Math.floor(new Date(t.at).getTime() / 1000),
      },
    ],
  };
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[slack] webhook responded HTTP ${res.status}`);
  } catch (e) {
    console.error('[slack] error sending:', (e as Error).message);
  }
}

async function sendEmail(t: Transition): Promise<void> {
  if (!transporter) return;
  const subject = `[Health] ${headline(t)}`;
  const html = `
    <h2>${headline(t)}</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr><td><b>Service</b></td><td>${t.serviceName}</td></tr>
      <tr><td><b>Transition</b></td><td>${t.from} → ${t.to}</td></tr>
      <tr><td><b>Reason</b></td><td>${t.reason}</td></tr>
      <tr><td><b>Detail</b></td><td>${t.message}</td></tr>
      <tr><td><b>When</b></td><td>${t.at}</td></tr>
    </table>`;
  try {
    await transporter.sendMail({ from: SMTP_FROM, to: ALERT_EMAIL_TO, subject, html });
  } catch (e) {
    console.error('[email] error sending:', (e as Error).message);
  }
}

export async function notify(t: Transition): Promise<void> {
  await Promise.allSettled([sendSlack(t), sendEmail(t)]);
}
