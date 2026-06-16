// Builds the list of services to monitor from environment variables.
// Public status pages are always active; authenticated synthetics
// are only enabled when the corresponding key exists.

import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceConfig } from './types.js';

// The backend runs with cwd = backend/, but the .env lives at the repo root.
// Load the root one first, then the local one as a fallback (without overwriting).
const here = dirname(fileURLToPath(import.meta.url)); // backend/src
dotenv.config({ path: resolve(here, '../../.env') }); // repo root
dotenv.config(); // fallback: backend/.env or cwd

const DEFAULT_INTERVAL = Number(process.env.DEFAULT_INTERVAL_SECONDS ?? 60);

export const PORT = Number(process.env.PORT ?? 4000);

export function buildServices(): ServiceConfig[] {
  const services: ServiceConfig[] = [];

  // ── Public status feeds (no key) ───────────────────────────────
  services.push({
    id: 'openai-status',
    name: 'OpenAI',
    category: 'status-feed',
    description: 'Official OpenAI status page (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.openai.com/api/v2/summary.json' },
  });

  services.push({
    id: 'deepgram-status',
    name: 'Deepgram',
    category: 'status-feed',
    description: 'Official Deepgram status page (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.deepgram.com/api/v2/summary.json' },
  });

  services.push({
    id: 'elevenlabs-status',
    name: 'ElevenLabs',
    category: 'status-feed',
    description: 'Official ElevenLabs status page (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.elevenlabs.io/api/v2/summary.json' },
  });

  services.push({
    id: 'soniox-status',
    name: 'Soniox',
    category: 'status-feed',
    description: 'Official Soniox status page (Better Uptime)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'betteruptime', url: 'https://status.soniox.com/api/v2/summary.json' },
  });

  // ── Qdrant: infrastructure synthetic ───────────────────────────
  // Always visible: if QDRANT_URL is missing, the card shows as "unconfigured".
  services.push({
    id: 'qdrant-cluster',
    name: 'Qdrant',
    category: 'synthetic',
    description: process.env.QDRANT_URL
      ? 'Direct health check against your Qdrant instance'
      : 'Health check for your Qdrant instance (unconfigured)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: process.env.QDRANT_URL
      ? {
          kind: 'qdrant',
          baseUrl: process.env.QDRANT_URL,
          apiKey: process.env.QDRANT_API_KEY || undefined,
          cluster: String(process.env.QDRANT_CHECK_CLUSTER).toLowerCase() === 'true',
        }
      : {
          kind: 'unconfigured',
          hint: 'Add QDRANT_URL (and QDRANT_API_KEY if applicable) in .env to enable this monitor',
        },
  });

  // ── Incident feed (RSS/Atom) ───────────────────────────────────
  // Complements summary.json with incident detail/history.
  services.push({
    id: 'openai-incidents',
    name: 'OpenAI · incidents',
    category: 'status-feed',
    description: 'OpenAI incident RSS feed',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'rss', url: 'https://status.openai.com/feed.rss' },
  });

  // ── Authenticated synthetics: account/billing-level health ─────
  // Detect expired key (401), payment failure (402), quota (429), etc.
  if (process.env.ELEVENLABS_API_KEY) {
    services.push({
      id: 'elevenlabs-account',
      name: 'ElevenLabs · account',
      category: 'account',
      description: 'ElevenLabs account: validates key and shows quota usage',
      intervalSeconds: DEFAULT_INTERVAL,
      check: { kind: 'elevenlabs-account', apiKey: process.env.ELEVENLABS_API_KEY },
    });
  }

  if (process.env.DEEPGRAM_API_KEY) {
    services.push({
      id: 'deepgram-account',
      name: 'Deepgram · account',
      category: 'account',
      description: 'Authenticated call to /v1/projects (detects key/billing)',
      intervalSeconds: DEFAULT_INTERVAL,
      check: {
        kind: 'synthetic',
        url: 'https://api.deepgram.com/v1/projects',
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
      },
    });
  }

  if (process.env.OPENAI_API_KEY) {
    services.push({
      id: 'openai-account',
      name: 'OpenAI · account',
      category: 'account',
      description: 'Authenticated call to /v1/models (detects key/billing/quota)',
      intervalSeconds: DEFAULT_INTERVAL,
      check: {
        kind: 'synthetic',
        url: 'https://api.openai.com/v1/models',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      },
    });
  }

  if (process.env.SONIOX_API_KEY) {
    services.push({
      id: 'soniox-account',
      name: 'Soniox · account',
      category: 'account',
      description: 'Authenticated call to the Soniox API (detects key/billing)',
      intervalSeconds: DEFAULT_INTERVAL,
      check: {
        kind: 'synthetic',
        // Lightweight read endpoint; adjust if your plan uses a different route.
        url: 'https://api.soniox.com/v1/models',
        headers: { Authorization: `Bearer ${process.env.SONIOX_API_KEY}` },
      },
    });
  }

  return services;
}
