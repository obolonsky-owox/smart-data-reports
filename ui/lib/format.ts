const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

/** An instant with its zone, as ODM returns TIMESTAMP values: `2026-11-10T05:50:55.000Z`. */
const ZONED_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * A zoned timestamp in the viewer's time zone, `2026-11-10 07:50:55`; null for anything else.
 * Values without a zone (DATE, DATETIME) have no instant to convert and stay as they are.
 */
export function formatTimestamp(value: string): string | null {
  if (!ZONED_TIMESTAMP.test(value)) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const ms = at.getMilliseconds();
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}${ms ? `.${pad(ms, 3)}` : ''}`
  );
}

export interface CellFormat {
  /**
   * The column is bucketed by day, week, month…: the storage cut the bucket in its own zone,
   * so a zoned bucket start shows as its date, never shifted into the viewer's zone.
   */
  dateBucket?: boolean;
}

export function formatCell(value: unknown, format: CellFormat = {}): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return NUMBER.format(value);
  if (typeof value === 'string') {
    if (format.dateBucket) return ZONED_TIMESTAMP.exec(value)?.[1] ?? value;
    return formatTimestamp(value) ?? value;
  }
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
