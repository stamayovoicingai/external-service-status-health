// Runs the checks for all services on a global interval,
// reconfigurable on the fly (auto-updater).

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

  /** Runs a check now and stores the result. */
  async runOnce(service: ServiceConfig): Promise<void> {
    try {
      const result = await runCheck(service.check);
      this.store.record(service.id, result);
    } catch (e) {
      this.store.record(service.id, {
        status: 'down',
        reason: 'unknown',
        latencyMs: null,
        message: `Unexpected check failure: ${(e as Error).message}`,
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
      // First check runs immediately, staggered so everything doesn't fire at once.
      const jitter = Math.floor(Math.random() * 1500);
      setTimeout(() => void this.runOnce(service), jitter);
    }
    this.schedule();
  }

  /** Changes the polling interval on the fly. */
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
