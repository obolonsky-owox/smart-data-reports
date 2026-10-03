import type { DataMartSummary, StorageSummary } from './odm-types';
import { groupByStorage } from './storages';

const mart = (id: string, extra: Partial<DataMartSummary> = {}): DataMartSummary => ({
  id, title: id.toUpperCase(), description: null, status: 'PUBLISHED', availableForReporting: true, storage: { type: 'GOOGLE_BIGQUERY' }, ...extra,
});

const storages: StorageSummary[] = [
  { id: 's-bq', title: 'BigQuery', type: 'GOOGLE_BIGQUERY' },
  { id: 's-empty', title: 'Empty', type: 'GOOGLE_BIGQUERY' },
  { id: 's-sf', title: 'Snowflake', type: 'SNOWFLAKE' },
];
const martIds = { 's-bq': ['a', 'b', 'draft', 'hidden'], 's-empty': ['only-draft'], 's-sf': ['c'] };
const marts = [
  mart('a'), mart('b'), mart('c', { storage: { type: 'SNOWFLAKE' } }),
  mart('draft', { status: 'DRAFT' }), mart('hidden', { availableForReporting: false }), mart('only-draft', { status: 'DRAFT' }),
];

it('groups reportable data marts by storage, in storage order', () => {
  const catalog = groupByStorage(storages, martIds, marts);
  expect(catalog.groups.map((g) => [g.storage.id, g.marts.map((m) => m.id)])).toEqual([
    ['s-bq', ['a', 'b']],
    ['s-sf', ['c']],
  ]);
});

it('keeps only published data marts available for reporting', () => {
  const { groups } = groupByStorage(storages, martIds, marts);
  expect(groups.flatMap((g) => g.marts).every((m) => m.status === 'PUBLISHED' && m.availableForReporting)).toBe(true);
});

it('skips storages without a reportable data mart', () => {
  expect(groupByStorage(storages, martIds, marts).groups.map((g) => g.storage.id)).not.toContain('s-empty');
  expect(groupByStorage(storages, {}, marts).groups).toEqual([]);
});

it('finds the storage of a data mart', () => {
  const catalog = groupByStorage(storages, martIds, marts);
  expect(catalog.storageOf('a')).toBe('s-bq');
  expect(catalog.storageOf('c')).toBe('s-sf');
  expect(catalog.storageOf('draft')).toBe('s-bq');
  expect(catalog.storageOf('unknown')).toBeUndefined();
});

it('lists reportable data marts that no storage claims', () => {
  const catalog = groupByStorage(storages, { 's-bq': ['a'] }, marts);
  expect(catalog.unassigned.map((m) => m.id)).toEqual(['b', 'c']);
  expect(groupByStorage(storages, martIds, marts).unassigned).toEqual([]);
});
