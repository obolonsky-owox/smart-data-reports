import type { Row, Totals } from './odm-types';
import { parseStoredReport, type CollectionLike } from './report-store';
import type { ReportDraft } from './report-draft';

/** Each member's own last result of each saved report, so a reopened report shows data right away. */
export const SNAPSHOTS_COLLECTION = 'snapshots';

/** ODM caps a collection document at 1 MiB; this leaves room for the envelope ODM adds. */
export const MAX_SNAPSHOT_BYTES = 900_000;

export interface RunSnapshot {
  schemaVersion: 1;
  ranAt: string;
  /** configHash of `draft`. */
  configHash: string;
  /** The draft that ran; its columns decide how the result's keys are read. */
  draft: ReportDraft;
  /** Row keys in column order, e.g. `visits | SUM`; rows store values in the same order. */
  keys: string[];
  rows: unknown[][];
  /** Rows the run returned. More than `rows.length` when rows were dropped to fit the size limit. */
  rowCount: number;
  /** The run itself stopped at the row cap. */
  truncated: boolean;
  totals: Totals | null;
}

export interface SnapshotInput {
  ranAt: string;
  configHash: string;
  draft: ReportDraft;
  rows: Row[];
  truncated: boolean;
  totals: Totals | null;
}

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Packs a result as arrays of values and keeps as many leading rows as fit under `maxBytes`. */
export function toSnapshot(input: SnapshotInput, maxBytes = MAX_SNAPSHOT_BYTES): RunSnapshot {
  const keys = input.rows[0] ? Object.keys(input.rows[0]) : [];
  const all = input.rows.map((row) => keys.map((key) => row[key] ?? null));
  const make = (count: number): RunSnapshot => ({
    schemaVersion: 1,
    ranAt: input.ranAt,
    configHash: input.configHash,
    draft: input.draft,
    keys,
    rows: all.slice(0, count),
    rowCount: all.length,
    truncated: input.truncated,
    totals: input.totals,
  });
  if (byteLength(make(all.length)) <= maxBytes) return make(all.length);
  // The largest row count that still fits; the empty snapshot always does.
  let low = 0;
  let high = all.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(make(mid)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return make(low);
}

export function snapshotRows(snapshot: RunSnapshot): Row[] {
  return snapshot.rows.map((values) => Object.fromEntries(snapshot.keys.map((key, i) => [key, values[i] ?? null])));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function parseSnapshot(value: unknown): RunSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (typeof value.ranAt !== 'string' || typeof value.configHash !== 'string') return null;
  if (!Array.isArray(value.keys) || !value.keys.every((k) => typeof k === 'string')) return null;
  if (!Array.isArray(value.rows) || !value.rows.every(Array.isArray)) return null;
  // The draft has the stored report's shape, so the report parser checks it.
  const draft = parseStoredReport({ schemaVersion: 1, title: '', draft: value.draft })?.draft;
  if (!draft) return null;
  return {
    schemaVersion: 1,
    ranAt: value.ranAt,
    configHash: value.configHash,
    draft,
    keys: value.keys as string[],
    rows: value.rows as unknown[][],
    rowCount: typeof value.rowCount === 'number' ? value.rowCount : value.rows.length,
    truncated: value.truncated === true,
    totals: isRecord(value.totals) ? (value.totals as Totals) : null,
  };
}

export function createSnapshotStore(collection: CollectionLike<RunSnapshot>) {
  return {
    /** The member's last result of a saved report, or null when there is none or it can't be read. */
    async get(reportId: string): Promise<RunSnapshot | null> {
      const doc = await collection.get(reportId);
      return doc ? parseSnapshot(doc.document) : null;
    },

    /** Stored under the report's id and its main data mart, which ODM checks the member's access to. */
    async put(reportId: string, snapshot: RunSnapshot): Promise<void> {
      await collection.put(reportId, snapshot, { parentId: snapshot.draft.mainDataMartId });
    },

    remove: (reportId: string) => collection.delete(reportId),
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
