import { useCallback, useEffect, useRef, useState } from 'react';
import type { OdmApi, QueryResult } from '../../lib/odm-api';
import type { Totals } from '../../lib/odm-types';
import { toReadPlan, toTraverseOptions } from '../../lib/read-plan';
import type { ReportDraft } from '../../lib/report-draft';
import { configHash } from '../../lib/report-store';
import { describeError, type UserFacingError } from '../../lib/errors';

export type RunState =
  | { status: 'idle'; cancelled?: boolean }
  | { status: 'running'; appliedHash: string }
  | { status: 'success'; result: QueryResult; totals: Totals | null; appliedHash: string; appliedDraft: ReportDraft }
  | { status: 'error'; error: UserFacingError; appliedHash: string };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useQueryRun(api: OdmApi, { totalsRetryMs = 3000 }: { totalsRetryMs?: number } = {}) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const current = useRef<AbortController | null>(null);

  const run = useCallback(
    async (dataMartId: string, draft: ReportDraft) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const appliedHash = configHash(draft);
      const isCurrent = () => current.current === controller && !controller.signal.aborted;
      setState({ status: 'running', appliedHash });
      try {
        const result = await api.runQuery(dataMartId, toTraverseOptions(toReadPlan(draft)), controller.signal);
        if (!isCurrent()) return;
        setState({ status: 'success', result, totals: null, appliedHash, appliedDraft: draft });
        if (!result.runId) return;
        // ODM writes totals into the run from a separate query, so the first read can be empty.
        let totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        if (totals === null && isCurrent()) {
          await wait(totalsRetryMs);
          totals = await api.getRunTotals(dataMartId, result.runId).catch(() => null);
        }
        if (isCurrent() && totals) {
          setState((s) => (s.status === 'success' && s.appliedHash === appliedHash ? { ...s, totals } : s));
        }
      } catch (error) {
        if (!isCurrent()) return;
        setState({ status: 'error', error: describeError(error), appliedHash });
      }
    },
    [api, totalsRetryMs],
  );

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setState({ status: 'idle', cancelled: true });
  }, []);

  useEffect(() => () => current.current?.abort(), []);

  return { state, run, cancel };
}
