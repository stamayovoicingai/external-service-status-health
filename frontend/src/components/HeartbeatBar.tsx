import type { HistoryPoint } from '../types';

const SLOTS = 40;

/** Uptime Kuma-style heartbeat bar: one small bar per recent check. */
export function HeartbeatBar({ history }: { history: HistoryPoint[] }) {
  const recent = history.slice(-SLOTS);
  const pad = Math.max(0, SLOTS - recent.length);

  return (
    <div className="heartbeat" title="Check history (left = oldest)">
      {Array.from({ length: pad }).map((_, i) => (
        <span key={`pad-${i}`} className="beat beat-empty" />
      ))}
      {recent.map((h, i) => (
        <span
          key={i}
          className={`beat beat-${h.status}`}
          title={`${new Date(h.checkedAt).toLocaleTimeString()} · ${h.status}${
            h.latencyMs != null ? ` · ${h.latencyMs}ms` : ''
          }`}
        />
      ))}
    </div>
  );
}
