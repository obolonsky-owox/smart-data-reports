import type { DataMartSummary } from './odm-types';
import { groupByStorage, storageKey } from './storages';

const BQ = { type: 'GOOGLE_BIGQUERY', title: 'Warehouse' };
const SF = { type: 'SNOWFLAKE', title: 'Finance' };
const mart = (id: string, extra: Partial<DataMartSummary> = {}): DataMartSummary => ({
  id, title: id.toUpperCase(), description: null, status: 'PUBLISHED', availableForReporting: true, storage: BQ, ...extra,
});

const marts = [
  mart('a'), mart('b'), mart('c', { storage: SF }),
  mart('draft', { status: 'DRAFT' }), mart('hidden', { availableForReporting: false }), mart('only-draft', { status: 'DRAFT', storage: { type: 'AWS_ATHENA', title: 'Empty' } }),
];

it('groups reportable data marts by the storage the data mart list names, by title', () => {
  const catalog = groupByStorage(marts);
  expect(catalog.groups.map((g) => [g.storage.title, g.marts.map((m) => m.id)])).toEqual([
    ['Finance', ['c']],
    ['Warehouse', ['a', 'b']],
  ]);
});

it('keeps only published data marts available for reporting and skips storages without one', () => {
  const { groups } = groupByStorage(marts);
  expect(groups.flatMap((g) => g.marts).every((m) => m.status === 'PUBLISHED' && m.availableForReporting)).toBe(true);
  expect(groups.map((g) => g.storage.title)).not.toContain('Empty');
});

it('tells storages of one type apart by title', () => {
  const { groups } = groupByStorage([mart('a'), mart('x', { storage: { type: 'GOOGLE_BIGQUERY', title: 'Sandbox' } })]);
  expect(groups.map((g) => g.storage.title)).toEqual(['Sandbox', 'Warehouse']);
});

it('finds the storage of a data mart', () => {
  const catalog = groupByStorage(marts);
  expect(catalog.storageOf('a')).toBe(storageKey(BQ));
  expect(catalog.storageOf('draft')).toBe(storageKey(BQ));
  expect(catalog.storageOf('unknown')).toBeUndefined();
});

it('names a storage without a title by its type', () => {
  expect(groupByStorage([mart('a', { storage: { type: 'SNOWFLAKE', title: '' } })]).groups[0]!.storage.title).toBe('SNOWFLAKE');
});
