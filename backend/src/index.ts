// Entry point: assembles services, starts the scheduler and exposes the REST API.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express from 'express';
import { buildServices, PORT } from './config.js';
import { runCheck } from './checks.js';
import { activeChannels, notify } from './notifier.js';
import { Scheduler } from './scheduler.js';
import { getInterval, INTERVAL_PRESETS, setInterval as setIntervalSetting } from './settings.js';
import { Store } from './store.js';
import type { ServiceState, Status } from './types.js';

const services = buildServices();
const store = new Store();
const scheduler = new Scheduler(store, services, getInterval());

// Basic console notifier on status changes.
// (Telegram / Slack / email would be wired in here later.)
store.onTransition((t) => {
  const icon = t.to === 'up' ? '✅' : t.to === 'down' ? '🔴' : '🟠';
  console.log(
    `${icon} [${t.at}] ${t.serviceName}: ${t.from} → ${t.to} — ${t.message} (${t.reason})`,
  );
  void notify(t);
});

// ── Serialization for the frontend ──────────────────────────────
function serialize(s: ServiceState) {
  return {
    id: s.config.id,
    name: s.config.name,
    category: s.config.category,
    description: s.config.description,
    intervalSeconds: s.config.intervalSeconds,
    status: s.latest?.status ?? 'unknown',
    reason: s.latest?.reason ?? 'unknown',
    message: s.latest?.message ?? 'No data yet',
    latencyMs: s.latest?.latencyMs ?? null,
    checkedAt: s.latest?.checkedAt ?? null,
    details: s.latest?.details ?? null,
    uptime24h: s.uptime24h,
    history: s.history.map((h) => ({
      status: h.status,
      latencyMs: h.latencyMs,
      checkedAt: h.checkedAt,
    })),
  };
}

function overall(states: ServiceState[]): Status {
  const statuses = states.map((s) => s.latest?.status ?? 'unknown');
  if (statuses.some((s) => s === 'down')) return 'down';
  if (statuses.some((s) => s === 'degraded')) return 'degraded';
  if (statuses.length > 0 && statuses.every((s) => s === 'up')) return 'up';
  return 'unknown';
}

// ── API ─────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, services: services.length, time: new Date().toISOString() });
});

app.get('/api/services', (_req, res) => {
  const states = store.all();
  res.json({
    overall: overall(states),
    updatedAt: new Date().toISOString(),
    intervalSeconds: scheduler.getInterval(),
    services: states.map(serialize),
  });
});

// Auto-updater settings.
app.get('/api/settings', (_req, res) => {
  res.json({ intervalSeconds: scheduler.getInterval(), presets: INTERVAL_PRESETS });
});

app.put('/api/settings', (req, res) => {
  const seconds = Number(req.body?.intervalSeconds);
  if (!Number.isFinite(seconds) || seconds < 15) {
    return res.status(400).json({ error: 'intervalSeconds must be a number ≥ 15' });
  }
  const applied = setIntervalSetting(seconds);
  scheduler.setInterval(applied);
  console.log(`⏱️  Auto-refresh interval: ${applied}s`);
  res.json({ intervalSeconds: applied, presets: INTERVAL_PRESETS });
});

app.get('/api/services/:id', (req, res) => {
  const state = store.get(req.params.id);
  if (!state) return res.status(404).json({ error: 'Service not found' });
  res.json(serialize(state));
});

// Force an immediate re-check of a service.
app.post('/api/services/:id/check', async (req, res) => {
  const service = services.find((s) => s.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  const result = await runCheck(service.check);
  store.record(service.id, result);
  res.json(serialize(store.get(service.id)!));
});

// In a single-service deployment, the backend serves the built frontend.
// STATIC_DIR is set by the Dockerfile; in local dev it doesn't exist and Vite + proxy is used.
const STATIC_DIR = process.env.STATIC_DIR;
if (STATIC_DIR && existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback: any GET that is not /api/* returns index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(STATIC_DIR, 'index.html'));
  });
  console.log(`🖥️  Serving static frontend from ${STATIC_DIR}`);
}

app.listen(PORT, () => {
  console.log(`\n🩺  Health API listening on http://localhost:${PORT}`);
  console.log(`    Monitoring ${services.length} service(s):`);
  for (const s of services) console.log(`      • ${s.name}  [${s.category}]`);
  const channels = activeChannels();
  console.log(
    channels.length > 0
      ? `    Notifications: ${channels.join(', ')}`
      : '    Notifications: console only (configure SLACK_WEBHOOK_URL or SMTP in .env)',
  );
  console.log(`    Auto-refresh every ${scheduler.getInterval()}s`);
  console.log('');
  scheduler.start();
});

process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});
