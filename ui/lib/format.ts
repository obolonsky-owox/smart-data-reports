const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return NUMBER.format(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** `Oct 2, 2026, 10:49 AM` in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return iso.slice(0, 10);
}
