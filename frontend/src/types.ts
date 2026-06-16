export type Status = 'up' | 'degraded' | 'down' | 'unknown';
export type Category = 'status-feed' | 'synthetic' | 'account';

export interface HistoryPoint {
  status: Status;
  latencyMs: number | null;
  checkedAt: string;
}

export interface Service {
  id: string;
  name: string;
  category: Category;
  description: string;
  intervalSeconds: number;
  status: Status;
  reason: string;
  message: string;
  latencyMs: number | null;
  checkedAt: string | null;
  details: Record<string, unknown> | null;
  uptime24h: number | null;
  history: HistoryPoint[];
}

export interface ServicesResponse {
  overall: Status;
  updatedAt: string;
  intervalSeconds: number;
  services: Service[];
}

export interface IntervalPreset {
  label: string;
  seconds: number;
}

export interface Settings {
  intervalSeconds: number;
  presets: IntervalPreset[];
}
