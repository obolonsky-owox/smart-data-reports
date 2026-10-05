import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EllipsisVertical, ExternalLink, FileText, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@owox/ui/components/dropdown-menu';
import { Skeleton } from '@owox/ui/components/skeleton';
import { useServices } from '../../services';
import { describeError, type UserFacingError } from '../../lib/errors';
import { formatRelativeTime } from '../../lib/format';
import type { SavedReport } from '../../lib/report-store';
import { odmReportsPath } from '../../lib/sheets-sync';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | { status: 'ready'; reports: SavedReport[]; martTitles: Map<string, string> };

export function ReportsListPage({ onOpen, onCreate }: { onOpen(id: string): void; onCreate(): void }) {
  const { store, snapshots, api, userId } = useServices();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [deleting, setDeleting] = useState<SavedReport | null>(null);

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
                  <th className='w-10 px-1 py-2'>
                    <span className='sr-only'>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.reports.map((r) => (
                  <tr key={r.id} className='group/row cursor-pointer border-t border-border hover:bg-accent' onClick={() => onOpen(r.id)}>
                    <td className='px-3 py-2 font-medium text-foreground'>{r.report.title}</td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {state.martTitles.get(r.report.draft.mainDataMartId) ?? 'Unavailable data mart'}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>{r.report.createdBy === userId ? 'You' : 'Another member'}</td>
                    <td className='px-3 py-2 text-muted-foreground' title={r.updatedAt}>{formatRelativeTime(r.updatedAt)}</td>
                    {/* The menu is not part of the row's click: opening it must not open the report. */}
                    <td className='px-1 py-1 text-right' onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100'
                            aria-label={`Actions for ${r.report.title}`}
                          >
                            <EllipsisVertical className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem variant='destructive' onSelect={() => setDeleting(r)}>
                            <Trash2 className='h-4 w-4' />
                            Delete report
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {deleting && (
        <DeleteReportDialog
          report={deleting}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await store.remove(deleting.id);
            // The member's kept last result goes too; one left behind only takes space.
            await snapshots.remove(deleting.id).catch(() => undefined);
            setState((s) => (s.status === 'ready' ? { ...s, reports: s.reports.filter((r) => r.id !== deleting.id) } : s));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

interface DeleteReportDialogProps {
  report: SavedReport;
  onDelete(): Promise<void>;
  onClose(): void;
}

/** Deletes the saved report only; a linked Google Sheets report in ODM stays, with a link to it. */
function DeleteReportDialog({ report, onDelete, onClose }: DeleteReportDialogProps) {
  const { projectId, navigate } = useServices();
  const [busy, setBusy] = useState(false);
  const linked = report.report.linkedReport;

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } catch (error) {
      toast.error(describeError(error, report.report.title).message);
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{report.report.title}”?</AlertDialogTitle>
          <AlertDialogDescription>It is deleted for everyone in this project. This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {linked && (
          <div className='flex flex-col items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm'>
            <p>
              This report has a Google Sheets report in ODM. It isn't deleted here and keeps running on its schedule. Delete it in ODM if you no
              longer need it.
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => navigate(odmReportsPath(projectId, linked.dataMartId ?? report.report.draft.mainDataMartId, linked.reportId))}
            >
              <ExternalLink className='h-4 w-4' />
              Open Google Sheets report in ODM
            </Button>
          </div>
        )}
        <AlertDialogFooter>
          {/* Radix focuses Cancel when the dialog opens, so Enter never deletes. */}
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant='destructive' disabled={busy} onClick={() => void remove()}>
            {busy && <Loader2 className='h-4 w-4 animate-spin' />}
            Delete report
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
