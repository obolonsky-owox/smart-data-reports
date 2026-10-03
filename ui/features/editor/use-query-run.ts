import { useCallback, useEffect, useRef, useState } from 'react';
import type { OdmApi, QueryResult } from '../../lib/odm-api';
import type { Totals } from '../../lib/odm-types';
import { toReadPlan, toTraverseOptions } from '../../lib/read-plan';
import type { ReportDraft } from '../../lib/report-draft';
import { configHash } from '../../lib/report-store';
import { snapshotRows, type RunSnapshot } from '../../lib/run-snapshot';
import { describeError, type UserFacingError } from '../../lib/errors';

export type RunState =
  | { status: 'idle'; cancelled?: boolean }
  | { status: 'running'; appliedHash: string }
  | {
      status: 'success';
      result: QueryResult;
      totals: Totals | null;
      appliedHash: string;
      appliedDraft: ReportDraft;
      ranAt: string;
      /** Totals are final: read, or given up on. */
      settled: boolean;
      /** Shown from the member's saved last result instead of a run in this session. */
      restored?: boolean;
      /** Rows the last run returned, when the saved result kept fewer to fit its size limit. */
      rowCount?: number;
    }
  | { status: 'error'; error: UserFacingError; appliedHash: string };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clock = () => new Date();

export function useQueryRun(
  api: OdmApi,
  { totalsRetryMs = 3000, now = clock }: { totalsRetryMs?: number; now?: () => Date } = {},
) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const current = useRef<AbortController | null>(null);

  const run = useCallback(
    /** `subject` names the data mart in error messages, e.g. "You don't have access to Visitor." */
    async (dataMartId: string, draft: ReportDraft, subject?: string) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const appliedHash = configHash(draft);
      const isCurrent = () => current.current === controller && !controller.signal.aborted;
      setState({ status: 'running', appliedHash });
      try {
        const result = await api.runQuery(dataMartId, toTraverseOptions(toReadPlan(draft)), controller.signal);
        if (!isCurrent()) return;
        const ranAt = now().toISOString();
        setState({ status: 'success', result, totals: null, appliedHash, appliedDraft: draft, ranAt, settled: !result.runId });
        if (!result.runId) return;
        // ODM writes totals into the run from a separate query, so the first read can be empty.
        let totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        if (totals === null && isCurrent()) {
          await wait(totalsRetryMs);
          totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        }
        if (isCurrent()) {
          setState((s) => (s.status === 'success' && s.ranAt === ranAt ? { ...s, totals: totals ?? s.totals, settled: true } : s));
        }
      } catch (error) {
        if (!isCurrent()) return;
        setState({ status: 'error', error: describeError(error, subject), appliedHash });
      }
    },
    [api, totalsRetryMs, now],
  );

  /** Shows a saved last result, unless a run has started or finished since. */
  const restore = useCallback((snapshot: RunSnapshot) => {
    const rowCount = snapshot.rowCount > snapshot.rows.length ? snapshot.rowCount : undefined;
    setState((s) =>
      s.status !== 'idle'
        ? s
        : {
            status: 'success',
            result: { rows: snapshotRows(snapshot), truncated: snapshot.truncated },
            totals: snapshot.totals,
            appliedHash: snapshot.configHash,
            appliedDraft: snapshot.draft,
            ranAt: snapshot.ranAt,
            settled: true,
            restored: true,
            ...(rowCount ? { rowCount } : {}),
          },
    );
  }, []);

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setState({ status: 'idle', cancelled: true });
  }, []);

  /** Drops the result and aborts any running query, e.g. when the main data mart changes. */
  const reset = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setState((s) => (s.status === 'idle' && !s.cancelled ? s : { status: 'idle' }));
  }, []);

  useEffect(() => () => current.current?.abort(), []);

  return { state, run, cancel, reset, restore };
}
