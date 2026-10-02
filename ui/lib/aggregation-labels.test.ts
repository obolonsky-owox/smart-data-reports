import type { FieldInfo } from './schema-index';
import { aggregationsFor, FN_LABEL, TRUNC_OPTIONS } from './aggregation-labels';

const field = (overrides: Partial<FieldInfo>): FieldInfo => ({
  name: 'f', label: 'F', description: '', type: 'STRING', kind: 'text', aliasPath: '', originalName: 'f', ...overrides,
});

it('prefers the functions ODM allows for a field', () => {
  expect(aggregationsFor(field({ kind: 'number', allowedAggregations: ['SUM', 'AVG'] }))).toEqual(['SUM', 'AVG']);
});

it('falls back to functions by field kind', () => {
  expect(aggregationsFor(field({ kind: 'number' }))).toEqual(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT']);
  expect(aggregationsFor(field({ kind: 'text' }))).toEqual(['COUNT', 'COUNT_DISTINCT']);
  expect(aggregationsFor(field({ kind: 'date' }))).toEqual(['MIN', 'MAX', 'COUNT_DISTINCT']);
  expect(aggregationsFor(field({ kind: 'boolean' }))).toEqual([]);
});

it('labels functions and date buckets the way ODM does', () => {
  expect(FN_LABEL.COUNT_DISTINCT).toBe('Count unique');
  expect(FN_LABEL.P50).toBe('Median');
  expect(TRUNC_OPTIONS.map((t) => t.label)).toEqual(['Full date', 'Day', 'Week', 'Month', 'Quarter', 'Year']);
});
