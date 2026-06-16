import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchServices, fetchSettings, recheck, updateInterval } from './api';
import { ServiceCard } from './components/ServiceCard';
import { STATUS_LABEL } from './components/StatusBadge';
import type { IntervalPreset, Service, ServicesResponse, Status } from './types';

const FALLBACK_PRESETS: IntervalPreset[] = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
];

interface Section {
  key: string;
  title: string;
  subtitle: string;
  match: (s: Service) => boolean;
}

// Two groups: public status (status pages) vs authenticated accounts (API keys).
const SECTIONS: Section[] = [
  {
    key: 'public',
    title: '🌐 Public provider status',
    subtitle: 'Official status pages · no API key required',
    match: (s) => s.category === 'status-feed',
  },
  {
    key: 'private',
    title: '🔑 Your accounts · API Keys',
    subtitle: 'Authenticated checks with your credentials · detect expired key, payment failure and quota',
    match: (s) => s.category === 'account' || s.category === 'synthetic',
  },
];

const OVERALL_MESSAGE: Record<Status, string> = {
  up: 'All services operational',
  degraded: 'Some services have issues',
  down: 'Some services are down',
  unknown: 'Waiting for data…',
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

  // Load presets + initial interval.
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setPresets(s.presets?.length ? s.presets : FALLBACK_PRESETS);
        setIntervalSeconds(s.intervalSeconds);
      })
      .catch(() => {});
    void load();
  }, [load]);

  // Auto-refresh based on the selected interval.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const id = setInterval(() => void loadRef.current(), intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds]);

  // Visual countdown until the next refresh.
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
            <p>External service monitor · Uptime Kuma style</p>
          </div>
        </div>
        <div className="controls">
          <label className="interval">
            Auto-refresh
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
          <span className="countdown">next in {fmt(countdown)}</span>
          <button onClick={load}>Refresh now</button>
        </div>
      </header>

      <section className={`overall overall-${overall}`}>
        <div className="overall-status">
          <span className={`big-dot dot-${overall}`} />
          <div>
            <h2>{OVERALL_MESSAGE[overall]}</h2>
            <p>
              Overall status: {STATUS_LABEL[overall]}
              {lastSync && ` · synced ${lastSync.toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <div className="overall-counts">
          <span className="count count-up">{counts.up ?? 0} operational</span>
          <span className="count count-degraded">{counts.degraded ?? 0} degraded</span>
          <span className="count count-down">{counts.down ?? 0} down</span>
        </div>
      </section>

      {error && (
        <div className="banner-error">
          Could not reach the backend ({error}). Is it running on port 4000?
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
                      ? 'Add API keys in .env to monitor your accounts.'
                      : 'No services in this section.'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="footer">
        <p>
          Auto-refresh every {fmt(intervalSeconds)} · status pages require no API key ·
          “account / billing” monitors appear once you add keys in <code>.env</code>.
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
