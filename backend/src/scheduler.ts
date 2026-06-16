// Ejecuta los checks de todos los servicios en un intervalo global,
// reconfigurable en caliente (auto-updater).

import { runCheck } from './checks.js';
import type { Store } from './store.js';
import type { ServiceConfig } from './types.js';

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private intervalSeconds: number;

  constructor(
    private store: Store,
    private services: ServiceConfig[],
    intervalSeconds: number,
  ) {
    this.intervalSeconds = Math.max(15, intervalSeconds);
  }

  /** Lanza un check ahora y guarda el resultado. */
  async runOnce(service: ServiceConfig): Promise<void> {
    try {
      const result = await runCheck(service.check);
      this.store.record(service.id, result);
    } catch (e) {
      this.store.record(service.id, {
        status: 'down',
        reason: 'unknown',
        latencyMs: null,
        message: `Fallo inesperado en el check: ${(e as Error).message}`,
        checkedAt: new Date().toISOString(),
      });
    }
  }

  private schedule(): void {
    for (const service of this.services) {
      const timer = setInterval(() => void this.runOnce(service), this.intervalSeconds * 1000);
      this.timers.set(service.id, timer);
    }
  }

  private clearTimers(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  start(): void {
    for (const service of this.services) {
      this.store.register(service);
      // Primer check inmediato, escalonado para no golpear todo a la vez.
      const jitter = Math.floor(Math.random() * 1500);
      setTimeout(() => void this.runOnce(service), jitter);
    }
    this.schedule();
  }

  /** Cambia el intervalo de polling en caliente. */
  setInterval(seconds: number): void {
    this.intervalSeconds = Math.max(15, Math.floor(seconds));
    this.clearTimers();
    this.schedule();
  }

  getInterval(): number {
    return this.intervalSeconds;
  }

  stop(): void {
    this.clearTimers();
  }
}
