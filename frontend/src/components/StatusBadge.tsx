import type { Status } from '../types';

export const STATUS_LABEL: Record<Status, string> = {
  up: 'Operativo',
  degraded: 'Degradado',
  down: 'Caído',
  unknown: 'Sin datos',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
