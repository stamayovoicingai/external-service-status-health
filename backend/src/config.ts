// Construye la lista de servicios a monitorear a partir de variables de entorno.
// Los status pages públicos están siempre activos; los synthetic autenticados
// solo se activan si existe la key correspondiente.

import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceConfig } from './types.js';

// El backend corre con cwd = backend/, pero el .env vive en la raíz del repo.
// Cargamos primero el de la raíz y luego el local como fallback (sin sobrescribir).
const here = dirname(fileURLToPath(import.meta.url)); // backend/src
dotenv.config({ path: resolve(here, '../../.env') }); // raíz del repo
dotenv.config(); // fallback: backend/.env o cwd

const DEFAULT_INTERVAL = Number(process.env.DEFAULT_INTERVAL_SECONDS ?? 60);

export const PORT = Number(process.env.PORT ?? 4000);

export function buildServices(): ServiceConfig[] {
  const services: ServiceConfig[] = [];

  // ── Status feeds públicos (sin key) ────────────────────────────
  services.push({
    id: 'openai-status',
    name: 'OpenAI',
    category: 'status-feed',
    description: 'Status page oficial de OpenAI (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.openai.com/api/v2/summary.json' },
  });

  services.push({
    id: 'deepgram-status',
    name: 'Deepgram',
    category: 'status-feed',
    description: 'Status page oficial de Deepgram (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.deepgram.com/api/v2/summary.json' },
  });

  services.push({
    id: 'elevenlabs-status',
    name: 'ElevenLabs',
    category: 'status-feed',
    description: 'Status page oficial de ElevenLabs (Statuspage)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'statuspage', url: 'https://status.elevenlabs.io/api/v2/summary.json' },
  });

  services.push({
    id: 'soniox-status',
    name: 'Soniox',
    category: 'status-feed',
    description: 'Status page oficial de Soniox (Better Uptime)',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'betteruptime', url: 'https://status.soniox.com/api/v2/summary.json' },
  });

  // ── Qdrant: synthetic de infraestructura ───────────────────────
  // Siempre visible: si falta QDRANT_URL, la card aparece "sin configurar".
  services.push({
    id: 'qdrant-cluster',
    name: 'Qdrant',
    category: 'synthetic',
    description: process.env.QDRANT_URL
      ? 'Health check directo contra tu instancia de Qdrant'
      : 'Health check de tu instancia de Qdrant (sin configurar)',
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
          hint: 'Añade QDRANT_URL (y QDRANT_API_KEY si aplica) en .env para activar este monitor',
        },
  });

  // ── Feed de incidentes (RSS/Atom) ──────────────────────────────
  // Complementa el summary.json con detalle/histórico de incidentes.
  services.push({
    id: 'openai-incidents',
    name: 'OpenAI · incidentes',
    category: 'status-feed',
    description: 'Feed RSS de incidentes de OpenAI',
    intervalSeconds: DEFAULT_INTERVAL,
    check: { kind: 'rss', url: 'https://status.openai.com/feed.rss' },
  });

  // ── Synthetic autenticados: salud a nivel de cuenta/billing ────
  // Detectan key expirada (401), falta de pago (402), cuota (429), etc.
  if (process.env.ELEVENLABS_API_KEY) {
    services.push({
      id: 'elevenlabs-account',
      name: 'ElevenLabs · cuenta',
      category: 'account',
      description: 'Cuenta ElevenLabs: valida key y muestra uso de cuota',
      intervalSeconds: DEFAULT_INTERVAL,
      check: { kind: 'elevenlabs-account', apiKey: process.env.ELEVENLABS_API_KEY },
    });
  }

  if (process.env.DEEPGRAM_API_KEY) {
    services.push({
      id: 'deepgram-account',
      name: 'Deepgram · cuenta',
      category: 'account',
      description: 'Llamada autenticada a /v1/projects (detecta key/billing)',
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
      name: 'OpenAI · cuenta',
      category: 'account',
      description: 'Llamada autenticada a /v1/models (detecta key/billing/cuota)',
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
      name: 'Soniox · cuenta',
      category: 'account',
      description: 'Llamada autenticada a la API de Soniox (detecta key/billing)',
      intervalSeconds: DEFAULT_INTERVAL,
      check: {
        kind: 'synthetic',
        // Endpoint de lectura ligero; ajusta si tu plan usa otra ruta.
        url: 'https://api.soniox.com/v1/models',
        headers: { Authorization: `Bearer ${process.env.SONIOX_API_KEY}` },
      },
    });
  }

  return services;
}
