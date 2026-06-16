import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchServices, fetchSettings, recheck, updateInterval } from './api';
import { ServiceCard } from './components/ServiceCard';
import { STATUS_LABEL } from './components/StatusBadge';
import type { IntervalPreset, Service, ServicesResponse, Status } from './types';

const FALLBACK_PRESETS: IntervalPreset[] = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hora', seconds: 3600 },
];

interface Section {
  key: string;
  title: string;
  subtitle: string;
  match: (s: Service) => boolean;
}

// Dos grupos: estado público (status pages) vs cuentas autenticadas (API keys).
const SECTIONS: Section[] = [
  {
    key: 'public',
    title: '🌐 Estado público del proveedor',
    subtitle: 'Status pages oficiales · no requieren API key',
    match: (s) => s.category === 'status-feed',
  },
  {
    key: 'private',
    title: '🔑 Tus cuentas · API Keys',
    subtitle: 'Checks autenticados con tus credenciales · detectan key expirada, falta de pago y cuota',
    match: (s) => s.category === 'account' || s.category === 'synthetic',
  },
];

const OVERALL_MESSAGE: Record<Status, string> = {
  up: 'Todos los servicios operativos',
  degraded: 'Algunos servicios con problemas',
  down: 'Hay servicios caídos',
  unknown: 'Esperando datos…',
};

export function App() {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [presets, setPresets] = useState<IntervalPreset[]>(FALLBACK_PRESETS);
  const [countdown, setCountdown] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchServices();
      setData(res);
      setIntervalSeconds(res.intervalSeconds);
      setError(null);
      setLastSync(new Date());
      setCountdown(res.intervalSeconds);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Cargar presets + intervalo inicial.
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setPresets(s.presets?.length ? s.presets : FALLBACK_PRESETS);
        setIntervalSeconds(s.intervalSeconds);
      })
      .catch(() => {});
    void load();
  }, [load]);

  // Auto-refresh según el intervalo seleccionado.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const id = setInterval(() => void loadRef.current(), intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds]);

  // Cuenta regresiva visual hasta la próxima actualización.
  useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const handleIntervalChange = useCallback(
    async (seconds: number) => {
      setIntervalSeconds(seconds);
      setCountdown(seconds);
      try {
        await updateInterval(seconds);
        await load();
      } catch {
        /* ignore */
      }
    },
    [load],
  );

  const handleRecheck = useCallback(
    async (id: string) => {
      try {
        await recheck(id);
        await load();
      } catch {
        /* ignore */
      }
    },
    [load],
  );

  const overall = data?.overall ?? 'unknown';
  const counts = (data?.services ?? []).reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>,
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🩺</span>
          <div>
            <h1>Service Health</h1>
            <p>Monitor de servicios externos · estilo Uptime Kuma</p>
          </div>
        </div>
        <div className="controls">
          <label className="interval">
            Auto-actualizar
            <select
              value={intervalSeconds}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
            >
              {presets.map((p) => (
                <option key={p.seconds} value={p.seconds}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <span className="countdown">próxima en {fmt(countdown)}</span>
          <button onClick={load}>Actualizar ahora</button>
        </div>
      </header>

      <section className={`overall overall-${overall}`}>
        <div className="overall-status">
          <span className={`big-dot dot-${overall}`} />
          <div>
            <h2>{OVERALL_MESSAGE[overall]}</h2>
            <p>
              Estado general: {STATUS_LABEL[overall]}
              {lastSync && ` · sincronizado ${lastSync.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <div className="overall-counts">
          <span className="count count-up">{counts.up ?? 0} operativos</span>
          <span className="count count-degraded">{counts.degraded ?? 0} degradados</span>
          <span className="count count-down">{counts.down ?? 0} caídos</span>
        </div>
      </section>

      {error && (
        <div className="banner-error">
          No se pudo contactar el backend ({error}). ¿Está corriendo en el puerto 4000?
        </div>
      )}

      <main>
        {SECTIONS.map((section) => {
          const items = (data?.services ?? []).filter(section.match);
          return (
            <section key={section.key} className="service-section">
              <div className="section-head">
                <h2>{section.title}</h2>
                <p>{section.subtitle}</p>
                <span className="section-count">{items.length}</span>
              </div>
              <div className="grid">
                {items.map((s) => (
                  <ServiceCard key={s.id} service={s} onRecheck={handleRecheck} />
                ))}
                {data && items.length === 0 && (
                  <p className="empty">
                    {section.key === 'private'
                      ? 'Añade API keys en .env para monitorear tus cuentas.'
                      : 'Sin servicios en esta sección.'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="footer">
        <p>
          Auto-actualización cada {fmt(intervalSeconds)} · los status pages no requieren API key ·
          los monitores de “cuenta / billing” aparecen al añadir keys en <code>.env</code>.
        </p>
      </footer>
    </div>
  );
}

function fmt(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${seconds}s`;
}
