import type { HistoryPoint } from '../types';

const SLOTS = 40;

/** Barra de latidos estilo Uptime Kuma: una barrita por check reciente. */
export function HeartbeatBar({ history }: { history: HistoryPoint[] }) {
  const recent = history.slice(-SLOTS);
  const pad = Math.max(0, SLOTS - recent.length);

  return (
    <div className="heartbeat" title="Historial de checks (izq. = más antiguo)">
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
