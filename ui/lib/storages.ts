import type { OdmApi } from './odm-api';
import type { DataMartSummary, StorageSummary } from './odm-types';

export interface StorageGroup {
  storage: StorageSummary;
  /** Published data marts available for reporting, in the order they were given. */
  marts: DataMartSummary[];
}

export interface StorageCatalog {
  /** Storages with at least one reportable data mart, in storage order. */
  groups: StorageGroup[];
  /** Reportable data marts that no storage lists. */
  unassigned: DataMartSummary[];
  storageOf(dataMartId: string): string | undefined;
}

const reportable = (m: DataMartSummary) => m.status === 'PUBLISHED' && m.availableForReporting;

/** Splits the reportable data marts by the storage that holds them. */
export function groupByStorage(
  storages: StorageSummary[],
  martIdsByStorage: Readonly<Record<string, readonly string[]>>,
  marts: DataMartSummary[],
): StorageCatalog {
  const storageByMart = new Map<string, string>();
  for (const storage of storages) {
    for (const id of martIdsByStorage[storage.id] ?? []) storageByMart.set(id, storage.id);
  }
  const candidates = marts.filter(reportable);
  const groups = storages
    .map((storage) => ({ storage, marts: candidates.filter((m) => storageByMart.get(m.id) === storage.id) }))
    .filter((group) => group.marts.length > 0);
  return {
    groups,
    unassigned: candidates.filter((m) => !storageByMart.has(m.id)),
    storageOf: (dataMartId) => storageByMart.get(dataMartId),
  };
}

export interface StorageMembership {
  storages: StorageSummary[];
  martIdsByStorage: Record<string, string[]>;
}

/** Loads every storage and the ids of the data marts it holds. */
export async function loadStorageMembership(
  api: Pick<OdmApi, 'listStorages' | 'listStorageMartIds'>,
): Promise<StorageMembership> {
  const storages = await api.listStorages();
  const ids = await Promise.all(storages.map((s) => api.listStorageMartIds(s.id)));
  return { storages, martIdsByStorage: Object.fromEntries(storages.map((s, i) => [s.id, ids[i]!])) };
}
