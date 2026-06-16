// Shared backend types.

export type Status = 'up' | 'degraded' | 'down' | 'unknown';

/** Monitor category: which kind of health it reports on. */
export type Category = 'status-feed' | 'synthetic' | 'account';

/**
 * Reason code that normalizes WHY a check is in a given state.
 * Especially useful for platform/account-level problems.
 */
export type ReasonCode =
  | 'ok'
  | 'degraded'
  | 'provider_outage'
  | 'auth_invalid' // 401 → invalid or expired key
  | 'payment_required' // 402 → payment failure / billing
  | 'forbidden' // 403 → account restricted / no permissions
  | 'rate_limited' // 429 → quota / rate limit
  | 'timeout'
  | 'network_error'
  | 'unconfigured' // an environment variable is missing to enable the monitor
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
      /** HTTP codes we treat as "up". Defaults to 200. */
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
  history: CheckResult[]; // most recent at the end
  uptime24h: number | null; // percentage 0-100
}
