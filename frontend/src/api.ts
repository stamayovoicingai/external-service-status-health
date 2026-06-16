import type { Service, ServicesResponse, Settings } from './types';

// En local queda vacío y usa el proxy de Vite (/api → :4000).
// En producción (Vercel) se define VITE_API_BASE_URL con la URL del backend (Render).
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export async function fetchServices(): Promise<ServicesResponse> {
  const res = await fetch(`${API_BASE}/api/services`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function recheck(id: string): Promise<Service> {
  const res = await fetch(`${API_BASE}/api/services/${id}/check`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${API_BASE}/api/settings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateInterval(intervalSeconds: number): Promise<Settings> {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intervalSeconds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
