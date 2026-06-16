// Runtime settings (auto-refresh interval), with persistence to disk.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // backend/src
const FILE = resolve(here, '../.data/settings.json');

// Presets offered in the frontend (seconds).
export const INTERVAL_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
];

const MIN_INTERVAL = 15;
const DEFAULT = Number(process.env.DEFAULT_INTERVAL_SECONDS ?? 60);

let intervalSeconds = Number.isFinite(DEFAULT) ? DEFAULT : 60;

function persist(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ intervalSeconds }, null, 2));
  } catch {
    /* best-effort persistence */
  }
}

(function load() {
  try {
    if (existsSync(FILE)) {
      const data = JSON.parse(readFileSync(FILE, 'utf8'));
      if (typeof data.intervalSeconds === 'number') {
        intervalSeconds = Math.max(MIN_INTERVAL, data.intervalSeconds);
      }
    }
  } catch {
    /* use default */
  }
})();

export function getInterval(): number {
  return intervalSeconds;
}

export function setInterval(seconds: number): number {
  intervalSeconds = Math.max(MIN_INTERVAL, Math.floor(seconds));
  persist();
  return intervalSeconds;
}
