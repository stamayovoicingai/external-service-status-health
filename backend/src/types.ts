// Tipos compartidos del backend.

export type Status = 'up' | 'degraded' | 'down' | 'unknown';

/** Categoría del monitor: de qué tipo de salud informa. */
export type Category = 'status-feed' | 'synthetic' | 'account';

/**
 * Código de razón que normaliza POR QUÉ un check está en cierto estado.
 * Especialmente útil para problemas a nivel de plataforma/cuenta.
 */
export type ReasonCode =
  | 'ok'
  | 'degraded'
  | 'provider_outage'
  | 'auth_invalid' // 401 → key inválida o expirada
  | 'payment_required' // 402 → falta de pago / billing
  | 'forbidden' // 403 → cuenta restringida / sin permisos
  | 'rate_limited' // 429 → cuota / rate limit
  | 'timeout'
  | 'network_error'
  | 'unconfigured' // falta una variable de entorno para activar el monitor
  | 'unknown';

export interface CheckResult {
  status: Status;
  reason: ReasonCode;
  latencyMs: number | null;
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string; // ISO 8601
}

export type CheckSpec =
  | { kind: 'statuspage'; url: string; timeoutMs?: number }
  | { kind: 'betteruptime'; url: string; timeoutMs?: number }
  | {
      kind: 'qdrant';
      baseUrl: string;
      apiKey?: string;
      cluster?: boolean;
      timeoutMs?: number;
    }
  | {
      kind: 'synthetic';
      url: string;
      method?: string;
      headers?: Record<string, string>;
      /** Códigos HTTP que consideramos "up". Por defecto 200. */
      expectStatus?: number[];
      timeoutMs?: number;
    }
  | { kind: 'rss'; url: string; timeoutMs?: number }
  | { kind: 'elevenlabs-account'; apiKey: string; timeoutMs?: number }
  | { kind: 'unconfigured'; hint: string };

export interface ServiceConfig {
  id: string;
  name: string;
  category: Category;
  description: string;
  intervalSeconds: number;
  check: CheckSpec;
}

export interface ServiceState {
  config: ServiceConfig;
  latest: CheckResult | null;
  history: CheckResult[]; // más reciente al final
  uptime24h: number | null; // porcentaje 0-100
}
