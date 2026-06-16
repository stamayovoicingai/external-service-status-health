// Almacén en memoria del estado de cada servicio + historial (ring buffer).
// Suficiente para un MVP; cambiar por SQLite/Postgres si se quiere persistencia.

import type { CheckResult, ServiceConfig, ServiceState } from './types.js';

const HISTORY_LIMIT = 200; // nº de checks guardados por servicio

export interface Transition {
  serviceId: string;
  serviceName: string;
  from: string;
  to: string;
  reason: string;
  message: string;
  at: string;
}

export class Store {
  private states = new Map<string, ServiceState>();
  private listeners: ((t: Transition) => void)[] = [];

  register(config: ServiceConfig): void {
    if (!this.states.has(config.id)) {
      this.states.set(config.id, { config, latest: null, history: [], uptime24h: null });
    }
  }

  onTransition(fn: (t: Transition) => void): void {
    this.listeners.push(fn);
  }

  record(serviceId: string, result: CheckResult): void {
    const state = this.states.get(serviceId);
    if (!state) return;

    const prev = state.latest;
    state.latest = result;
    state.history.push(result);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.uptime24h = computeUptime(state.history);

    // Detectar transición de estado para notificaciones.
    if (prev && prev.status !== result.status) {
      const t: Transition = {
        serviceId,
        serviceName: state.config.name,
        from: prev.status,
        to: result.status,
        reason: result.reason,
        message: result.message,
        at: result.checkedAt,
      };
      for (const fn of this.listeners) {
        try {
          fn(t);
        } catch {
          /* no romper el ciclo por un listener */
        }
      }
    }
  }

  get(serviceId: string): ServiceState | undefined {
    return this.states.get(serviceId);
  }

  all(): ServiceState[] {
    return [...this.states.values()];
  }
}

function computeUptime(history: CheckResult[]): number | null {
  if (history.length === 0) return null;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => new Date(h.checkedAt).getTime() >= cutoff);
  const sample = recent.length > 0 ? recent : history;
  const ok = sample.filter((h) => h.status === 'up').length;
  return Math.round((ok / sample.length) * 1000) / 10; // 1 decimal
}
