import { formatCell, formatCount, formatRelativeTime, formatTimestamp } from './format';

// Node reads TZ on every conversion, so the viewer's zone is fixed for this file.
process.env.TZ = 'America/New_York';

it('renders any cell value without crashing', () => {
  expect(formatCell(null)).toBe('—');
  expect(formatCell(undefined)).toBe('—');
  expect(formatCell(true)).toBe('true');
  expect(formatCell(1234567)).toBe('1,234,567');
  expect(formatCell(0.1234567891)).toBe('0.123457');
  expect(formatCell({ a: [1, 2] })).toBe('{"a":[1,2]}');
  const long = 'x'.repeat(5000);
  expect(formatCell(long)).toBe(long);
});

it('formats counts and relative times', () => {
  expect(formatCount(2500)).toBe('2,500');
  const now = new Date('2026-10-02T12:00:00Z');
  expect(formatRelativeTime('2026-10-02T11:59:30Z', now)).toBe('just now');
  expect(formatRelativeTime('2026-10-02T11:00:00Z', now)).toBe('1 h ago');
  expect(formatRelativeTime('2026-09-30T12:00:00Z', now)).toBe('2 d ago');
  expect(formatRelativeTime('2026-08-01T12:00:00Z', now)).toBe('2026-08-01');
});

it('shows zoned timestamps in the viewer\'s time zone', () => {
  expect(formatCell('2026-11-10T05:50:55.000Z')).toBe('2026-11-10 00:50:55');
  expect(formatCell('2026-11-10T02:05:12.000Z')).toBe('2026-11-09 21:05:12');
  expect(formatTimestamp('2026-07-01T12:00:00.250+02:00')).toBe('2026-07-01 06:00:00.250');
  expect(formatTimestamp('2026-11-10 05:50:55 UTC')).toBeNull();
});

it('keeps values without a zone, and text that only looks like a date', () => {
  expect(formatCell('2026-11-10')).toBe('2026-11-10');
  expect(formatCell('2026-11-10T05:50:55')).toBe('2026-11-10T05:50:55');
  expect(formatCell('Released 2026-11-10T05:50:55Z')).toBe('Released 2026-11-10T05:50:55Z');
});

it('shows a date bucket as its date, never shifted into the viewer\'s zone', () => {
  expect(formatCell('2026-11-10T00:00:00.000Z', { dateBucket: true })).toBe('2026-11-10');
  expect(formatCell('2026-11-10', { dateBucket: true })).toBe('2026-11-10');
});
