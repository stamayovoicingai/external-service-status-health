import { useState } from 'react';
import type { Service } from '../types';
import { HeartbeatBar } from './HeartbeatBar';
import { StatusBadge } from './StatusBadge';

const CATEGORY_LABEL: Record<string, string> = {
  'status-feed': 'Status oficial',
  synthetic: 'Synthetic',
  account: 'Cuenta / billing',
};

// Razones de cuenta/plataforma que merecen una alerta destacada.
const ACCOUNT_REASONS = new Set([
  'auth_invalid',
  'payment_required',
  'forbidden',
  'rate_limited',
]);

const REASON_LABEL: Record<string, string> = {
  auth_invalid: '🔑 API key inválida o expirada',
  payment_required: '💳 Falta de pago / billing',
  forbidden: '🚫 Cuenta restringida',
  rate_limited: '⏳ Cuota / rate limit agotado',
  provider_outage: '🌩️ Caída del proveedor',
  timeout: '⌛ Timeout',
  network_error: '📡 Error de red',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `hace ${secs}s`;
  if (secs < 3600) return `hace ${Math.round(secs / 60)}m`;
  return `hace ${Math.round(secs / 3600)}h`;
}

export function ServiceCard({
  service,
  onRecheck,
}: {
  service: Service;
  onRecheck: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const alert = ACCOUNT_REASONS.has(service.reason);

  const incidents = (service.details?.incidents as any[]) ?? [];
  const degradedComponents = (service.details?.degradedComponents as any[]) ?? [];
  const recentFeed = (service.details?.recent as any[]) ?? [];

  async function handleRecheck() {
    setBusy(true);
    await onRecheck(service.id);
    setBusy(false);
  }

  return (
    <div className={`card card-${service.status}`}>
      <div className="card-head">
        <div className="card-title">
          <h3>{service.name}</h3>
          <span className="category">{CATEGORY_LABEL[service.category] ?? service.category}</span>
        </div>
        <StatusBadge status={service.status} />
      </div>

      <p className="message">{service.message}</p>

      {alert && (
        <div className="account-alert">{REASON_LABEL[service.reason] ?? service.reason}</div>
      )}

      <HeartbeatBar history={service.history} />

      <div className="metrics">
        <span>
          <strong>{service.latencyMs != null ? `${service.latencyMs} ms` : '—'}</strong> latencia
        </span>
        <span>
          <strong>{service.uptime24h != null ? `${service.uptime24h}%` : '—'}</strong> uptime 24h
        </span>
        <span>{timeAgo(service.checkedAt)}</span>
      </div>

      <div className="card-actions">
        <button onClick={handleRecheck} disabled={busy}>
          {busy ? 'Comprobando…' : 'Re-check'}
        </button>
        {(incidents.length > 0 || degradedComponents.length > 0 || service.details) && (
          <button className="link" onClick={() => setOpen((v) => !v)}>
            {open ? 'Ocultar detalles' : 'Detalles'}
          </button>
        )}
      </div>

      {open && (
        <div className="details">
          {incidents.length > 0 && (
            <div>
              <h4>Incidentes abiertos</h4>
              <ul>
                {incidents.map((i, idx) => (
                  <li key={idx}>
                    {i.url ? (
                      <a href={i.url} target="_blank" rel="noreferrer">
                        {i.name}
                      </a>
                    ) : (
                      i.name
                    )}{' '}
                    <em>({i.impact})</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {degradedComponents.length > 0 && (
            <div>
              <h4>Componentes afectados</h4>
              <ul>
                {degradedComponents.map((c, idx) => (
                  <li key={idx}>
                    {c.name} — <em>{c.status}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {recentFeed.length > 0 && (
            <div>
              <h4>Incidentes recientes (feed)</h4>
              <ul>
                {recentFeed.map((r, idx) => (
                  <li key={idx}>
                    {r.title} — <em>{r.state}</em>
                    <br />
                    <small>{new Date(r.date).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <pre>{JSON.stringify(service.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
