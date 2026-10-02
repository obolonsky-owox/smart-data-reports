import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { ReportRunStatus } from '../../lib/odm-types';
import type { ReportDraft } from '../../lib/report-draft';
import { configHash, stableHash, type LinkedReport, type SavedReport, type StoredReport } from '../../lib/report-store';
import { createLinkedReport, updateLinkedReport, type SyncOutcome } from '../../lib/sheets-sync';

export type SaveOutcome =
  | { kind: 'saved' }
  | { kind: 'synced'; runStatus: ReportRunStatus; runError?: string }
  | { kind: 'link-missing' }
  /** The main data mart changed, so the link to the ODM report on the old one was removed. */
  | { kind: 'link-dropped' }
  /** The document was saved; the ODM report was not updated, for `message`. */
  | { kind: 'sync-failed'; message: string };

export interface SyncOptions {
  /** The draft has validation issues, so it is saved but never pushed to ODM. */
  hasIssues?: boolean;
}

export const SYNC_BLOCKED_MESSAGE = 'fix the problems in the column panel first.';

export interface ReportDocument {
  status: 'loading' | 'ready' | 'error';
  error?: UserFacingError;
  savedId?: string;
  saved?: StoredReport;
  title: string;
  setTitle(title: string): void;
  draft: ReportDraft | null;
  setDraft: Dispatch<SetStateAction<ReportDraft | null>>;
  dirty: boolean;
  isAuthor: boolean;
  saveWithSync(options?: { asCopy?: boolean } & SyncOptions): Promise<SaveOutcome>;
  createSheetsReport(input: { title: string; destinationId: string }): Promise<SyncOutcome>;
  updateSheetsReport(options?: SyncOptions): Promise<SaveOutcome>;
}

interface SaveOptions { asCopy?: boolean; title?: string; linkedReport?: LinkedReport | null }

export function useReportDocument(reportId: string | undefined): ReportDocument {
  const { store, api, userId, pollIntervalMs } = useServices();
  const [status, setStatus] = useState<ReportDocument['status']>(reportId ? 'loading' : 'ready');
  const [error, setError] = useState<UserFacingError>();
  const [saved, setSaved] = useState<{ id?: string; report?: StoredReport }>({});
  const [title, setTitle] = useState('Untitled report');
  const [draft, setDraft] = useState<ReportDraft | null>(null);

  // Saves can run back-to-back (save → create Sheets report → save); refs give each step the latest state.
  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const titleRef = useRef(title);
  useLayoutEffect(() => {
    savedRef.current = saved;
    draftRef.current = draft;
    titleRef.current = title;
  });

  useEffect(() => {
    if (!reportId) return;
    let alive = true;
    store.get(reportId).then(
      (found) => {
        if (!alive) return;
        if (!found) {
          setError({ message: 'This report no longer exists.', retryable: false });
          setStatus('error');
          return;
        }
        setSaved({ id: found.id, report: found.report });
        setTitle(found.report.title);
        setDraft(found.report.draft);
        setStatus('ready');
      },
      (e) => {
        if (!alive) return;
        setError(describeError(e, 'this report'));
        setStatus('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [reportId, store]);

  const save = useCallback(
    async ({ asCopy = false, title: titleOverride, linkedReport }: SaveOptions = {}): Promise<SavedReport> => {
      const current = draftRef.current;
      if (!current) throw new Error('Choose a data mart first.');
      const previous = asCopy ? {} : savedRef.current;
      const nextTitle = titleOverride ?? titleRef.current;
      const report: StoredReport = {
        schemaVersion: 1,
        title: nextTitle,
        draft: current,
        createdBy: previous.report?.createdBy ?? userId,
        updatedBy: userId,
        linkedReport: linkedReport === null ? undefined : (linkedReport ?? previous.report?.linkedReport),
      };
      const result = await store.save({ id: previous.id, report, previousParentId: previous.report?.draft.mainDataMartId });
      savedRef.current = { id: result.id, report: result.report };
      titleRef.current = nextTitle;
      setSaved(savedRef.current);
      setTitle(nextTitle);
      return result;
    },
    [store, userId],
  );

  const syncLinked = useCallback(
    async (linked: LinkedReport, { hasIssues = false }: SyncOptions): Promise<SaveOutcome> => {
      const current = draftRef.current!;
      // ODM checks a report's columns against the data mart it was created on, and an update
      // can't move it, so a report on another main data mart can't stay linked.
      if (linked.dataMartId !== undefined && linked.dataMartId !== current.mainDataMartId) {
        await save({ linkedReport: null });
        return { kind: 'link-dropped' };
      }
      // Save first, so a failed update never loses the edits; the link keeps its old hash.
      await save();
      if (hasIssues) return { kind: 'sync-failed', message: SYNC_BLOCKED_MESSAGE };
      let result: Awaited<ReturnType<typeof updateLinkedReport>>;
      try {
        result = await updateLinkedReport(api, linked, { title: titleRef.current, draft: current }, { intervalMs: pollIntervalMs });
      } catch (error) {
        return { kind: 'sync-failed', message: describeError(error, 'this Google Sheets report').message };
      }
      if ('missing' in result) {
        await save({ linkedReport: null });
        return { kind: 'link-missing' };
      }
      await save({ linkedReport: result.linked });
      return { kind: 'synced', runStatus: result.runStatus, runError: result.runError };
    },
    [api, save, pollIntervalMs],
  );

  const saveWithSync = useCallback(
    async ({ asCopy = false, ...sync }: { asCopy?: boolean } & SyncOptions = {}): Promise<SaveOutcome> => {
      const linked = asCopy ? undefined : savedRef.current.report?.linkedReport;
      if (linked && draftRef.current && linked.syncedDraftHash !== configHash(draftRef.current)) return syncLinked(linked, sync);
      await save(asCopy ? { asCopy, title: `${titleRef.current} (copy)`, linkedReport: null } : {});
      return { kind: 'saved' };
    },
    [save, syncLinked],
  );

  const updateSheetsReport = useCallback(
    async (options: SyncOptions = {}): Promise<SaveOutcome> => {
      const linked = savedRef.current.report?.linkedReport;
      if (!linked) throw new Error('This report has no Google Sheets report yet.');
      return syncLinked(linked, options);
    },
    [syncLinked],
  );

  const createSheetsReport = useCallback(
    async ({ title: reportTitle, destinationId }: { title: string; destinationId: string }): Promise<SyncOutcome> => {
      await save({ title: reportTitle });
      const outcome = await createLinkedReport(
        api,
        { title: reportTitle, destinationId, draft: draftRef.current! },
        { intervalMs: pollIntervalMs },
      );
      await save({ title: reportTitle, linkedReport: outcome.linked });
      return outcome;
    },
    [api, save, pollIntervalMs],
  );

  const dirty =
    draft !== null &&
    (!saved.report || saved.report.title !== title || stableHash(saved.report.draft) !== stableHash(draft));

  return {
    status,
    error,
    savedId: saved.id,
    saved: saved.report,
    title,
    setTitle,
    draft,
    setDraft,
    dirty,
    isAuthor: !saved.report || saved.report.createdBy === userId,
    saveWithSync,
    createSheetsReport,
    updateSheetsReport,
  };
}
