import { useEffect, useState } from 'react';
import { Download, FileCode2, RefreshCw, Sheet, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import type { LinkedReport } from '../../lib/report-store';
import { tokenizeSql, type SqlToken } from '../../lib/sql-highlight';

const TOKEN_CLASS: Record<SqlToken['kind'], string> = {
  keyword: 'font-semibold text-primary',
  string: 'text-success',
  number: 'text-warning',
  comment: 'italic text-muted-foreground',
  plain: '',
};

/** The last run's SQL, `pending` while the run or its details are still being read. */
export type LastRunSql = 'pending' | { sql: string | null; ranAt: string; changedSince: boolean } | null;

interface SqlTabProps {
  lastRun: LastRunSql;
  linked?: LinkedReport;
  draftChanged: boolean;
  reportTitle: string;
  onCreateSheets(): void;
  onUpdateSheets(): void;
}

type SqlState = { status: 'loading' } | { status: 'ready'; sql: string } | { status: 'error'; error: UserFacingError };

function download(filename: string, text: string) {
  // Clipboard access is blocked in the plugin iframe; downloads are allowed.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/sql' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function SqlCode({ sql, filename, note }: { sql: string; filename: string; note?: string }) {
  return (
    <>
      <div className='flex items-center justify-end gap-2'>
        {note && <p className='mr-auto text-xs text-muted-foreground'>{note}</p>}
        <Button variant='outline' size='sm' onClick={() => download(filename, sql)}>
          <Download className='h-4 w-4' />
          Download .sql
        </Button>
      </div>
      <pre className='dm-card overflow-auto font-mono text-xs leading-relaxed whitespace-pre' data-testid='sqlCode'>
        {tokenizeSql(sql).map((token, i) => (
          <span key={i} className={cn(TOKEN_CLASS[token.kind])}>
            {token.text}
          </span>
        ))}
      </pre>
    </>
  );
}

export function SqlTab({ lastRun, linked, draftChanged, reportTitle, onCreateSheets, onUpdateSheets }: SqlTabProps) {
  const { api } = useServices();
  const [state, setState] = useState<SqlState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const runSql = lastRun !== 'pending' ? lastRun?.sql : null;
  // The Google Sheets report's SQL is the fallback for runs without SQL, e.g. on an older host.
  const reportId = lastRun === 'pending' || runSql ? undefined : linked?.reportId;
  const version = linked?.syncedDraftHash;
  const filename = `${reportTitle.replace(/[^\w-]+/g, '_') || 'report'}.sql`;

  useEffect(() => {
    if (!reportId) return;
    let alive = true;
    setState({ status: 'loading' });
    api.getReportSql(reportId).then(
      (sql) => alive && setState({ status: 'ready', sql }),
      (error) => alive && setState({ status: 'error', error: describeError(error, 'this report') }),
    );
    return () => {
      alive = false;
    };
  }, [api, reportId, version, attempt]);

  if (lastRun === 'pending') return <Skeleton className='my-2 h-64 w-full' />;

  if (lastRun && runSql) {
    const note = lastRun.changedSince
      ? `SQL from the last run, ${formatDateTime(lastRun.ranAt)}. Run the report again to see the SQL for your changes.`
      : `SQL from the last run, ${formatDateTime(lastRun.ranAt)}.`;
    return (
      <div className='flex flex-col gap-2 py-2'>
        <SqlCode sql={runSql} filename={filename} note={note} />
      </div>
    );
  }

  if (!linked) {
    return (
      <div className='dm-empty-state'>
        <FileCode2 className='dm-empty-state-ico' />
        <h2 className='dm-empty-state-title'>{lastRun ? "ODM didn't return SQL for the last run." : 'Run the report to see its SQL.'}</h2>
        <p className='dm-empty-state-subtitle'>
          {lastRun ? 'Create' : 'Or create'} a Google Sheets report with this configuration to get both the SQL and the report.
        </p>
        <Button onClick={onCreateSheets}>
          <Sheet className='h-4 w-4' />
          Create Google Sheets report
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2 py-2'>
      {draftChanged && (
        <Alert className='border-warning/40 bg-warning-bg text-warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertTitle>This SQL belongs to the Google Sheets report, not to your current changes.</AlertTitle>
          <AlertDescription className='text-warning'>
            <Button size='sm' variant='outline' className='mt-1' onClick={onUpdateSheets}>
              Update report
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'loading' && <Skeleton className='h-64 w-full' />}
      {state.status === 'error' && (
        <Alert variant='destructive'>
          <AlertTitle>{state.error.message}</AlertTitle>
          <AlertDescription>
            <Button variant='outline' size='sm' className='mt-1' onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className='h-4 w-4' />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && <SqlCode sql={state.sql} filename={filename} />}
    </div>
  );
}
