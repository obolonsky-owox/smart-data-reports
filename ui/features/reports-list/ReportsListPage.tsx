import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Skeleton } from '@owox/ui/components/skeleton';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import { formatRelativeTime } from '../../lib/format';
import type { SavedReport } from '../../lib/report-store';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | { status: 'ready'; reports: SavedReport[]; martTitles: Map<string, string> };

export function ReportsListPage({ onOpen, onCreate }: { onOpen(id: string): void; onCreate(): void }) {
  const { store, api, userId } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    // Data mart titles are a nicety: without them the reports still list as "Unavailable data mart".
    const [reports, marts] = await Promise.allSettled([store.listAll(), api.listDataMarts()]);
    if (reports.status === 'rejected') {
      setState({ status: 'error', error: describeError(reports.reason, 'saved reports') });
      return;
    }
    const titles = marts.status === 'fulfilled' ? marts.value.map((m): [string, string] => [m.id, m.title]) : [];
    setState({ status: 'ready', reports: reports.value, martTitles: new Map(titles) });
  }, [store, api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <div className='flex items-center justify-between gap-4'>
          <h1 className='dm-page-header-title'>Reports</h1>
          <Button onClick={onCreate} data-testid='newReport'>
            <Plus className='h-4 w-4' />
            New report
          </Button>
        </div>
      </header>
      <div className='dm-page-content'>
        {state.status === 'loading' && (
          <div className='dm-card flex flex-col gap-2' data-testid='reportsLoading'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <Alert variant='destructive'>
            <AlertTitle>Couldn't load your reports</AlertTitle>
            <AlertDescription>
              <p>{state.error.message}</p>
              <Button variant='outline' size='sm' className='mt-2' onClick={() => void load()}>
                <RefreshCw className='h-4 w-4' />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {state.status === 'ready' && state.reports.length === 0 && (
          <div className='dm-empty-state'>
            <FileText className='dm-empty-state-ico' />
            <h2 className='dm-empty-state-title'>Build your first report</h2>
            <p className='dm-empty-state-subtitle'>Pick a data mart, tick the columns you need and see the result in seconds.</p>
            <Button onClick={onCreate}>
              <Plus className='h-4 w-4' />
              New report
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.reports.length > 0 && (
          <div className='dm-card' data-testid='reportsTable'>
            <table className='w-full text-sm'>
              <thead className='text-left text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2 font-medium'>Title</th>
                  <th className='px-3 py-2 font-medium'>Data mart</th>
                  <th className='px-3 py-2 font-medium'>Author</th>
                  <th className='px-3 py-2 font-medium'>Updated</th>
                </tr>
              </thead>
              <tbody>
                {state.reports.map((r) => (
                  <tr key={r.id} className='cursor-pointer border-t border-border hover:bg-accent' onClick={() => onOpen(r.id)}>
                    <td className='px-3 py-2 font-medium text-foreground'>{r.report.title}</td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {state.martTitles.get(r.report.draft.mainDataMartId) ?? 'Unavailable data mart'}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{r.report.createdBy === userId ? 'You' : 'Another member'}</td>
                    <td className='px-3 py-2 text-muted-foreground' title={r.updatedAt}>{formatRelativeTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
