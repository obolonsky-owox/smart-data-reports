import { formatCell, formatCount, formatRelativeTime } from './format';

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
