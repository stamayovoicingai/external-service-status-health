import type { Service, ServicesResponse, Settings } from './types';

export async function fetchServices(): Promise<ServicesResponse> {
  const res = await fetch('/api/services');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function recheck(id: string): Promise<Service> {
  const res = await fetch(`/api/services/${id}/check`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateInterval(intervalSeconds: number): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intervalSeconds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
