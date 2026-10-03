import type { DataMartSummary, StorageSummary } from './odm-types';

export interface StorageGroup {
  storage: StorageSummary;
  /** Published data marts available for reporting, in the order they were given. */
  marts: DataMartSummary[];
}

export interface StorageCatalog {
  /** Storages with at least one reportable data mart, by title. */
  groups: StorageGroup[];
  storageOf(dataMartId: string): string | undefined;
}

const reportable = (m: DataMartSummary) => m.status === 'PUBLISHED' && m.availableForReporting;

/**
 * Identifies a storage by what the data mart list tells about it: its type and title. The list carries no
 * storage id, and reading the ids elsewhere (storages, model canvas) can fail for a storage the member can't
 * see, which used to hide the whole storage choice.
 */
export function storageKey(storage: DataMartSummary['storage']): string {
  return `${storage.type}/${storage.title}`;
}

/** Splits the reportable data marts by the storage that holds them. */
export function groupByStorage(marts: DataMartSummary[]): StorageCatalog {
  const groups = new Map<string, StorageGroup>();
  for (const mart of marts.filter(reportable)) {
    const id = storageKey(mart.storage);
    let group = groups.get(id);
    if (!group) {
      group = { storage: { id, title: mart.storage.title || mart.storage.type, type: mart.storage.type }, marts: [] };
      groups.set(id, group);
    }
    group.marts.push(mart);
  }
  const storageByMart = new Map(marts.map((m) => [m.id, storageKey(m.storage)]));
  return {
    groups: [...groups.values()].sort((a, b) => a.storage.title.localeCompare(b.storage.title)),
    storageOf: (dataMartId) => storageByMart.get(dataMartId),
  };
}
