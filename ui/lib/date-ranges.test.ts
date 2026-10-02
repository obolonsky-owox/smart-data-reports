import { DATE_RANGE_PRESETS, dateRangeToRule, describeDateRange } from './date-ranges';

const today = new Date(2026, 9, 2); // 2 Oct 2026, local time

describe('dateRangeToRule', () => {
  it('sends Last N days as N days including today', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_30_days' }, today)).toEqual({
      column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 29 },
    });
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_7_days' }, today)).toMatchObject({ value: { n: 6 } });
  });

  it('maps calendar presets to ODM relative kinds', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_month' }, today)).toEqual({
      column: 'd', operator: 'relative_date', value: { kind: 'last_month' },
    });
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'today' }, today)).toMatchObject({ value: { kind: 'today' } });
  });

  it('computes Last year as an explicit range, because ODM has no last_year kind', () => {
    expect(dateRangeToRule('d', { kind: 'preset', preset: 'last_year' }, today)).toEqual({
      column: 'd', operator: 'between', value: { from: '2025-01-01', to: '2025-12-31' },
    });
  });

  it('sends custom ranges as between and All time as no rule', () => {
    expect(dateRangeToRule('d', { kind: 'custom', from: '2026-01-01', to: '2026-01-31' }, today)).toEqual({
      column: 'd', operator: 'between', value: { from: '2026-01-01', to: '2026-01-31' },
    });
    expect(dateRangeToRule('d', { kind: 'all-time' }, today)).toBeNull();
  });

  it('maps every preset to a rule', () => {
    for (const { preset } of DATE_RANGE_PRESETS) {
      expect(dateRangeToRule('d', { kind: 'preset', preset }, today)).not.toBeNull();
    }
  });
});

describe('describeDateRange', () => {
  it('labels presets, custom ranges and All time', () => {
    expect(describeDateRange({ kind: 'preset', preset: 'last_30_days' })).toBe('Last 30 days');
    expect(describeDateRange({ kind: 'custom', from: '2026-01-01', to: '2026-01-31' })).toBe('2026-01-01 – 2026-01-31');
    expect(describeDateRange({ kind: 'all-time' })).toBe('All time');
  });
});
