// Motor de health checks. Cada "kind" sabe cómo consultar un proveedor
// y normaliza el resultado a un CheckResult uniforme.

import { XMLParser } from 'fast-xml-parser';
import type { CheckResult, CheckSpec, ReasonCode, Status } from './types.js';

const DEFAULT_TIMEOUT = 10_000;

function now(): string {
  return new Date().toISOString();
}

function make(
  status: Status,
  reason: ReasonCode,
  latencyMs: number | null,
  message: string,
  details?: Record<string, unknown>,
): CheckResult {
  return { status, reason, latencyMs, message, details, checkedAt: now() };
}

/** fetch con timeout vía AbortController. */
async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response; latencyMs: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const latencyMs = Math.round(performance.now() - start);
    return { res, latencyMs };
  } finally {
    clearTimeout(t);
  }
}

function errorToResult(e: unknown, latencyMs: number): CheckResult {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'AbortError') {
    return make('down', 'timeout', latencyMs, 'Timeout: el servicio no respondió a tiempo');
  }
  return make('down', 'network_error', null, `Error de red: ${err?.message ?? String(e)}`);
}

// ── Atlassian Statuspage (OpenAI, Deepgram, ElevenLabs) ──────────
function indicatorToStatus(indicator: string): { status: Status; reason: ReasonCode } {
  switch (indicator) {
    case 'none':
      return { status: 'up', reason: 'ok' };
    case 'minor':
      return { status: 'degraded', reason: 'degraded' };
    case 'maintenance':
      return { status: 'degraded', reason: 'degraded' };
    case 'major':
    case 'critical':
      return { status: 'down', reason: 'provider_outage' };
    default:
      return { status: 'unknown', reason: 'unknown' };
  }
}

async function checkStatuspage(url: string, timeoutMs: number): Promise<CheckResult> {
  let latencyMs = 0;
  try {
    const out = await timedFetch(url, { headers: { accept: 'application/json' } }, timeoutMs);
    latencyMs = out.latencyMs;
    if (!out.res.ok) {
      return make('down', 'provider_outage', latencyMs, `El status page respondió HTTP ${out.res.status}`);
    }
    const data: any = await out.res.json();
    const indicator: string = data?.status?.indicator ?? 'unknown';
    const description: string = data?.status?.description ?? '';
    const { status, reason } = indicatorToStatus(indicator);

    const components: any[] = Array.isArray(data?.components) ? data.components : [];
    const degradedComponents = components
      .filter((c) => c?.status && c.status !== 'operational' && !c.group)
      .map((c) => ({ name: c.name, status: c.status }));

    const incidentsRaw: any[] = Array.isArray(data?.incidents) ? data.incidents : [];
    const openIncidents = incidentsRaw.filter((i) => i?.status && i.status !== 'resolved');

    const message = description || (status === 'up' ? 'Todos los sistemas operativos' : indicator);
    return make(status, reason, latencyMs, message, {
      indicator,
      description,
      openIncidents: openIncidents.length,
      incidents: openIncidents.slice(0, 5).map((i) => ({
        name: i.name,
        status: i.status,
        impact: i.impact,
        url: i.shortlink,
      })),
      degradedComponents,
    });
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── Better Uptime (Soniox) ───────────────────────────────────────
function betterStatus(raw: string): { status: Status; reason: ReasonCode } {
  switch (String(raw).toUpperCase()) {
    case 'UP':
      return { status: 'up', reason: 'ok' };
    case 'HASISSUES':
    case 'DEGRADED':
      return { status: 'degraded', reason: 'degraded' };
    case 'MAINTENANCE':
    case 'UNDERMAINTENANCE':
      return { status: 'degraded', reason: 'degraded' };
    case 'DOWN':
      return { status: 'down', reason: 'provider_outage' };
    default:
      return { status: 'unknown', reason: 'unknown' };
  }
}

async function checkBetterUptime(url: string, timeoutMs: number): Promise<CheckResult> {
  let latencyMs = 0;
  try {
    const out = await timedFetch(url, { headers: { accept: 'application/json' } }, timeoutMs);
    latencyMs = out.latencyMs;
    if (!out.res.ok) {
      return make('down', 'provider_outage', latencyMs, `El status page respondió HTTP ${out.res.status}`);
    }
    const data: any = await out.res.json();
    const raw: string = data?.page?.status ?? 'unknown';
    const { status, reason } = betterStatus(raw);
    const message =
      status === 'up' ? 'Todos los sistemas operativos' : `Estado reportado: ${raw}`;
    return make(status, reason, latencyMs, message, { reported: raw, page: data?.page?.name });
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── Qdrant (synthetic de infraestructura) ────────────────────────
async function checkQdrant(
  baseUrl: string,
  apiKey: string | undefined,
  cluster: boolean,
  timeoutMs: number,
): Promise<CheckResult> {
  const base = baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) headers['api-key'] = apiKey;

  let latencyMs = 0;
  try {
    const out = await timedFetch(`${base}/healthz`, { headers }, timeoutMs);
    latencyMs = out.latencyMs;
    if (out.res.status === 401 || out.res.status === 403) {
      return make('down', 'auth_invalid', latencyMs, 'Qdrant rechazó la api-key (inválida o ausente)');
    }
    if (!out.res.ok) {
      return make('down', 'provider_outage', latencyMs, `Qdrant /healthz respondió HTTP ${out.res.status}`);
    }

    const details: Record<string, unknown> = { healthz: 'ok', endpoint: base };

    if (cluster) {
      try {
        const c = await timedFetch(`${base}/cluster`, { headers }, timeoutMs);
        if (c.res.ok) {
          const cdata: any = await c.res.json();
          const result = cdata?.result ?? {};
          details.cluster = {
            status: result.status,
            peerId: result.peer_id,
            peers: result.peers ? Object.keys(result.peers).length : undefined,
          };
          if (result.status && result.status !== 'enabled') {
            return make('degraded', 'degraded', latencyMs, `Clúster en estado: ${result.status}`, details);
          }
        } else {
          details.cluster = `no disponible (HTTP ${c.res.status})`;
        }
      } catch {
        details.cluster = 'no disponible (error al consultar /cluster)';
      }
    }

    return make('up', 'ok', latencyMs, 'Qdrant operativo (healthz OK)', details);
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── Synthetic autenticado (cuenta / billing / key) ───────────────
// Interpreta el código HTTP para detectar problemas a nivel de plataforma.
function httpToAccountResult(httpStatus: number, latencyMs: number, expect: number[]): CheckResult {
  if (expect.includes(httpStatus) || (httpStatus >= 200 && httpStatus < 300)) {
    return make('up', 'ok', latencyMs, `API respondió HTTP ${httpStatus} — credenciales válidas`);
  }
  switch (httpStatus) {
    case 401:
      return make('down', 'auth_invalid', latencyMs, '401 — API key inválida o expirada');
    case 402:
      return make('down', 'payment_required', latencyMs, '402 — Falta de pago / billing (servicio suspendido)');
    case 403:
      return make('degraded', 'forbidden', latencyMs, '403 — Cuenta restringida o sin permisos');
    case 429:
      return make('degraded', 'rate_limited', latencyMs, '429 — Cuota o rate limit agotado');
    default:
      if (httpStatus >= 500) {
        return make('down', 'provider_outage', latencyMs, `${httpStatus} — Error del proveedor`);
      }
      return make('degraded', 'unknown', latencyMs, `HTTP ${httpStatus} inesperado`);
  }
}

async function checkSynthetic(
  spec: Extract<CheckSpec, { kind: 'synthetic' }>,
  timeoutMs: number,
): Promise<CheckResult> {
  const expect = spec.expectStatus ?? [200];
  let latencyMs = 0;
  try {
    const out = await timedFetch(
      spec.url,
      { method: spec.method ?? 'GET', headers: spec.headers ?? {} },
      timeoutMs,
    );
    latencyMs = out.latencyMs;
    return httpToAccountResult(out.res.status, latencyMs, expect);
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── RSS / Atom (feed de incidentes) ──────────────────────────────
// Deriva el estado actual del incidente más reciente de un Statuspage feed.
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function stripTags(html: string): string {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Estado del update más reciente dentro de la descripción de un incidente.
function feedItemState(body: string): { status: Status; reason: ReasonCode; label: string } {
  const text = stripTags(body).toLowerCase();
  // El feed no expone el impacto (minor/major), así que un incidente activo
  // se marca como "degraded" en lugar de "down" para no sobre-alarmar.
  // Las caídas totales se reflejan vía el indicator del status page (summary.json).
  const order: Array<[RegExp, Status, ReasonCode, string]> = [
    [/resolved|completed|recovered/, 'up', 'ok', 'resolved'],
    [/investigating/, 'degraded', 'degraded', 'investigating'],
    [/identified/, 'degraded', 'degraded', 'identified'],
    [/monitoring/, 'degraded', 'degraded', 'monitoring'],
    [/verifying|update/, 'degraded', 'degraded', 'update'],
    [/scheduled|in progress|maintenance/, 'degraded', 'degraded', 'maintenance'],
  ];
  // El update más reciente aparece primero en el texto del Statuspage feed.
  let best: [number, Status, ReasonCode, string] | null = null;
  for (const [re, status, reason, label] of order) {
    const idx = text.search(re);
    if (idx >= 0 && (best === null || idx < best[0])) best = [idx, status, reason, label];
  }
  if (!best) return { status: 'up', reason: 'ok', label: 'sin estado' };
  return { status: best[1], reason: best[2], label: best[3] };
}

async function checkRss(url: string, timeoutMs: number): Promise<CheckResult> {
  let latencyMs = 0;
  try {
    const out = await timedFetch(url, { headers: { accept: 'application/rss+xml, application/atom+xml' } }, timeoutMs);
    latencyMs = out.latencyMs;
    if (!out.res.ok) {
      return make('down', 'provider_outage', latencyMs, `El feed respondió HTTP ${out.res.status}`);
    }
    const xml = await out.res.text();
    const data: any = xmlParser.parse(xml);

    // Normalizar RSS (rss.channel.item) y Atom (feed.entry).
    let items: any[] = [];
    if (data?.rss?.channel?.item) {
      items = Array.isArray(data.rss.channel.item) ? data.rss.channel.item : [data.rss.channel.item];
      items = items.map((it) => ({
        title: typeof it.title === 'object' ? it.title['#text'] : it.title,
        date: it.pubDate ?? it.published ?? it.updated,
        body: it.description ?? it['content:encoded'] ?? '',
      }));
    } else if (data?.feed?.entry) {
      const entries = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry];
      items = entries.map((e: any) => ({
        title: typeof e.title === 'object' ? e.title['#text'] : e.title,
        date: e.updated ?? e.published,
        body: (typeof e.content === 'object' ? e.content['#text'] : e.content) ?? e.summary ?? '',
      }));
    }

    if (items.length === 0) {
      return make('up', 'ok', latencyMs, 'Sin incidentes publicados en el feed', { source: url });
    }

    // Ordenar por fecha desc para tomar el incidente más reciente.
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = items[0];
    const state = feedItemState(latest.body);

    const message =
      state.status === 'up'
        ? 'Sin incidentes activos (último incidente resuelto)'
        : `Incidente activo: ${latest.title} (${state.label})`;

    return make(state.status, state.reason, latencyMs, message, {
      source: url,
      latestIncident: { title: latest.title, date: latest.date, state: state.label },
      recent: items.slice(0, 5).map((i) => ({
        title: i.title,
        date: i.date,
        state: feedItemState(i.body).label,
      })),
    });
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── ElevenLabs cuenta (key + cuota de caracteres) ────────────────
async function checkElevenLabsAccount(apiKey: string, timeoutMs: number): Promise<CheckResult> {
  let latencyMs = 0;
  try {
    const out = await timedFetch(
      'https://api.elevenlabs.io/v1/user',
      { headers: { 'xi-api-key': apiKey } },
      timeoutMs,
    );
    latencyMs = out.latencyMs;

    // Reutilizamos la interpretación de códigos (401/402/403/429…).
    if (out.res.status !== 200) {
      return httpToAccountResult(out.res.status, latencyMs, [200]);
    }

    const data: any = await out.res.json();
    const sub = data?.subscription ?? {};
    const used = Number(sub.character_count ?? 0);
    const limit = Number(sub.character_limit ?? 0);
    const usagePct = limit > 0 ? Math.round((used / limit) * 1000) / 10 : null;
    const tier = sub.tier ?? 'desconocido';

    const details = {
      tier,
      charactersUsed: used,
      characterLimit: limit,
      usagePct,
      nextReset: sub.next_character_count_reset_unix
        ? new Date(sub.next_character_count_reset_unix * 1000).toISOString()
        : undefined,
    };

    // Avisar si la cuota está casi agotada (billing/limit).
    if (usagePct != null && usagePct >= 95) {
      return make('degraded', 'rate_limited', latencyMs, `Cuota casi agotada: ${usagePct}% usado`, details);
    }
    const pctTxt = usagePct != null ? ` · cuota ${usagePct}%` : '';
    return make('up', 'ok', latencyMs, `Cuenta OK (tier ${tier})${pctTxt}`, details);
  } catch (e) {
    return errorToResult(e, latencyMs);
  }
}

// ── Dispatcher ───────────────────────────────────────────────────
export async function runCheck(spec: CheckSpec): Promise<CheckResult> {
  const timeoutMs = ('timeoutMs' in spec && spec.timeoutMs) || DEFAULT_TIMEOUT;
  switch (spec.kind) {
    case 'statuspage':
      return checkStatuspage(spec.url, timeoutMs);
    case 'betteruptime':
      return checkBetterUptime(spec.url, timeoutMs);
    case 'qdrant':
      return checkQdrant(spec.baseUrl, spec.apiKey, spec.cluster ?? false, timeoutMs);
    case 'synthetic':
      return checkSynthetic(spec, timeoutMs);
    case 'rss':
      return checkRss(spec.url, timeoutMs);
    case 'elevenlabs-account':
      return checkElevenLabsAccount(spec.apiKey, timeoutMs);
    case 'unconfigured':
      return make('unknown', 'unconfigured', null, spec.hint);
  }
}
