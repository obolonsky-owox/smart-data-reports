import type { ReportDraft } from './report-draft';

export const REPORTS_COLLECTION = 'reports';

export interface LinkedReport {
  reportId: string;
  destinationId: string;
  spreadsheetId: string;
  sheetId: number;
  /** configHash of the draft the ODM report was last updated with. */
  syncedDraftHash: string;
  /** The data mart the ODM report reads; absent on links created before it was recorded. */
  dataMartId?: string;
}

export interface StoredReport {
  schemaVersion: 1;
  title: string;
  draft: ReportDraft;
  createdBy: string;
  updatedBy: string;
  linkedReport?: LinkedReport;
}

export interface SavedReport { id: string; report: StoredReport; updatedAt: string }

export interface CollectionDoc<T> {
  id: string;
  parentId?: string;
  document: T;
  createdAt: string;
  updatedAt: string;
}

/** The subset of the SDK's PluginCollection this store uses. */
export interface CollectionLike<T> {
  list(options?: { limit?: number; cursor?: string }): Promise<{ items: CollectionDoc<T>[]; nextCursor: string | null }>;
  get(id: string): Promise<CollectionDoc<T> | null>;
  put(id: string, document: T, options?: { parentId?: string }): Promise<CollectionDoc<T>>;
  delete(id: string): Promise<void>;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a over the stable JSON form. Enough to detect change, not a security hash. */
export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Changes only when the query ODM would run changes. */
export function configHash(draft: ReportDraft): string {
  return stableHash({
    mainDataMartId: draft.mainDataMartId,
    columns: draft.columns,
    dateRanges: draft.dateRanges.map(({ column, range }) => ({ column, range })),
    filters: draft.filters.map(({ id: _id, ...rest }) => rest),
    sorts: draft.sorts,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function isLinkedReport(value: unknown): value is LinkedReport {
  return (
    isRecord(value) &&
    typeof value.reportId === 'string' &&
    typeof value.destinationId === 'string' &&
    typeof value.spreadsheetId === 'string' &&
    typeof value.sheetId === 'number' &&
    typeof value.syncedDraftHash === 'string'
  );
}

function parseLinkedReport(value: unknown): LinkedReport | undefined {
  if (!isLinkedReport(value)) return undefined;
  const { reportId, destinationId, spreadsheetId, sheetId, syncedDraftHash, dataMartId } = value;
  return { reportId, destinationId, spreadsheetId, sheetId, syncedDraftHash, ...(typeof dataMartId === 'string' ? { dataMartId } : {}) };
}

export function parseStoredReport(value: unknown): StoredReport | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.title !== 'string') return null;
  const draft = value.draft;
  if (!isRecord(draft) || typeof draft.mainDataMartId !== 'string') return null;
  return {
    schemaVersion: 1,
    title: value.title,
    createdBy: typeof value.createdBy === 'string' ? value.createdBy : '',
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : '',
    linkedReport: parseLinkedReport(value.linkedReport),
    draft: {
      mainDataMartId: draft.mainDataMartId,
      includedPaths: asArray(draft.includedPaths),
      columns: asArray(draft.columns),
      dateRanges: asArray(draft.dateRanges),
      filters: asArray(draft.filters),
      sorts: asArray(draft.sorts),
      dateRangeOptOut: asArray(draft.dateRangeOptOut),
    },
  };
}

function defaultId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createReportStore(collection: CollectionLike<StoredReport>, newId: () => string = defaultId) {
  return {
    /** Entity-bound pages can be short or empty while a cursor remains; page until it is null. */
    async listAll(): Promise<SavedReport[]> {
      const reports: SavedReport[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await collection.list({ limit: 100, ...(cursor ? { cursor } : {}) });
        for (const item of page.items) {
          const report = parseStoredReport(item.document);
          if (report) reports.push({ id: item.id, report, updatedAt: item.updatedAt });
        }
        cursor = page.nextCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw new Error('The reports collection returned a repeated cursor.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      return reports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(id: string): Promise<SavedReport | null> {
      const doc = await collection.get(id);
      const report = doc ? parseStoredReport(doc.document) : null;
      return doc && report ? { id: doc.id, report, updatedAt: doc.updatedAt } : null;
    },

    async save({ id, report, previousParentId }: { id?: string; report: StoredReport; previousParentId?: string }): Promise<SavedReport> {
      const parentId = report.draft.mainDataMartId;
      const moving = id !== undefined && previousParentId !== undefined && previousParentId !== parentId;
      const targetId = id === undefined || moving ? newId() : id;
      const doc = await collection.put(targetId, report, { parentId });
      // Write under the new parent first, then drop the old document, so a failure never loses the report.
      if (moving && id !== undefined) await collection.delete(id);
      return { id: doc.id, report, updatedAt: doc.updatedAt };
    },

    remove: (id: string) => collection.delete(id),
  };
}

export type ReportStore = ReturnType<typeof createReportStore>;
