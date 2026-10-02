import { useEffect, useState } from 'react';
import { Download, FileCode2, RefreshCw, Sheet, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { LinkedReport } from '../../lib/report-store';
import { tokenizeSql, type SqlToken } from '../../lib/sql-highlight';

const TOKEN_CLASS: Record<SqlToken['kind'], string> = {
  keyword: 'font-semibold text-primary',
  string: 'text-success',
  number: 'text-warning',
  comment: 'italic text-muted-foreground',
  plain: '',
};

interface SqlTabProps {
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

export function SqlTab({ linked, draftChanged, reportTitle, onCreateSheets, onUpdateSheets }: SqlTabProps) {
  const { api } = useServices();
  const [state, setState] = useState<SqlState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reportId = linked?.reportId;
  const version = linked?.syncedDraftHash;

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

  if (!linked) {
    return (
      <div className='dm-empty-state'>
        <FileCode2 className='dm-empty-state-ico' />
        <h2 className='dm-empty-state-title'>ODM doesn't return SQL for ad-hoc queries yet.</h2>
        <p className='dm-empty-state-subtitle'>Create a Google Sheets report with this configuration to get both the SQL and the report.</p>
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
      {state.status === 'ready' && (
        <>
          <div className='flex justify-end'>
            <Button variant='outline' size='sm' onClick={() => download(`${reportTitle.replace(/[^\w-]+/g, '_') || 'report'}.sql`, state.sql)}>
              <Download className='h-4 w-4' />
              Download .sql
            </Button>
          </div>
          <pre className='dm-card overflow-auto font-mono text-xs leading-relaxed whitespace-pre' data-testid='sqlCode'>
            {tokenizeSql(state.sql).map((token, i) => (
              <span key={i} className={cn(TOKEN_CLASS[token.kind])}>
                {token.text}
              </span>
            ))}
          </pre>
        </>
      )}
    </div>
  );
}
