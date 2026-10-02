import { useEffect, useState } from 'react';
import { CircleCheckBig, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { NativeSelect } from '../../components/NativeSelect';
import { useServices } from '../../services';
import { describeError } from '../../lib/errors';
import type { SheetsDestination } from '../../lib/odm-types';
import type { LinkedReport } from '../../lib/report-store';
import { odmDestinationsPath, odmReportsPath, spreadsheetUrl, type SyncOutcome } from '../../lib/sheets-sync';
import type { SaveOutcome } from '../editor/use-report-document';

interface SheetsReportDialogProps {
  mode: 'create' | 'update';
  defaultTitle: string;
  dataMartId: string;
  /** The saved report's current link; it appears mid-create once the ODM report exists. */
  linked?: LinkedReport;
  onCreate(input: { title: string; destinationId: string }): Promise<SyncOutcome>;
  onUpdate(): Promise<SaveOutcome>;
  onClose(): void;
}

type Step =
  | { kind: 'form' }
  | { kind: 'working' }
  | { kind: 'done'; linked?: LinkedReport; runStatus: string; runError?: string }
  | { kind: 'missing'; message: string }
  | { kind: 'error'; message: string };

const DELETED_MESSAGE = 'The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.';
const DROPPED_MESSAGE = "This Google Sheets report reads the previous data mart, so it's no longer linked. Create a new one for this data mart.";

export function SheetsReportDialog({ mode: initialMode, defaultTitle, dataMartId, linked, onCreate, onUpdate, onClose }: SheetsReportDialogProps) {
  const { api, projectId, openExternal, navigate } = useServices();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [title, setTitle] = useState(defaultTitle);
  const [destinations, setDestinations] = useState<SheetsDestination[] | null>(null);
  const [destinationId, setDestinationId] = useState('');

  useEffect(() => {
    if (mode !== 'create') return;
    let alive = true;
    api.listSheetsDestinations().then(
      (list) => {
        if (!alive) return;
        setDestinations(list);
        setDestinationId((current) => current || list[0]?.id || '');
      },
      (error) => alive && setStep({ kind: 'error', message: describeError(error, 'Google Sheets destinations').message }),
    );
    return () => {
      alive = false;
    };
  }, [api, mode]);

  async function create() {
    setStep({ kind: 'working' });
    try {
      const outcome = await onCreate({ title: title.trim() || defaultTitle, destinationId });
      setStep({ kind: 'done', linked: outcome.linked, runStatus: outcome.runStatus, runError: outcome.runError });
    } catch (error) {
      setStep({ kind: 'error', message: describeError(error).message });
    }
  }

  async function update() {
    setStep({ kind: 'working' });
    try {
      const outcome = await onUpdate();
      if (outcome.kind === 'link-missing') setStep({ kind: 'missing', message: DELETED_MESSAGE });
      else if (outcome.kind === 'link-dropped') setStep({ kind: 'missing', message: DROPPED_MESSAGE });
      else if (outcome.kind === 'sync-failed') setStep({ kind: 'error', message: `Saved. Google Sheets wasn't updated: ${outcome.message}` });
      else if (outcome.kind === 'synced') setStep({ kind: 'done', runStatus: outcome.runStatus, runError: outcome.runError });
      else setStep({ kind: 'done', runStatus: 'SUCCESS' });
    } catch (error) {
      setStep({ kind: 'error', message: describeError(error).message });
    }
  }

  // Once the ODM report exists, a failed create is finished with Update, never a second Create.
  const resumed = mode === 'create' && !!linked && (step.kind === 'form' || step.kind === 'error');
  const actionMode = resumed ? 'update' : mode;
  // The run carries on in ODM without the dialog, so it may be closed once the link is stored.
  const canClose = step.kind !== 'working' || !!linked;
  const openInOdm = (
    <Button variant='outline' className='w-fit' onClick={() => navigate(odmReportsPath(projectId, dataMartId))}>
      Open report in ODM
    </Button>
  );

  const doneMessage = (s: Extract<Step, { kind: 'done' }>) =>
    s.runStatus === 'SUCCESS'
      ? 'Your Google Sheets report is ready.'
      : s.runStatus === 'RUNNING'
        ? 'The report is still running. Open it in ODM to follow its progress.'
        : `The report was saved, but its run failed${s.runError ? `: ${s.runError}` : '.'}`;

  return (
    <Dialog open onOpenChange={(open) => !open && canClose && onClose()}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{actionMode === 'create' ? 'Create Google Sheets report' : 'Update Google Sheets'}</DialogTitle>
          <DialogDescription>
            {actionMode === 'create'
              ? 'ODM creates a new spreadsheet and fills it with this configuration — no 2,500-row limit, and you get the SQL too.'
              : 'Push the current configuration into the same spreadsheet and run the report.'}
          </DialogDescription>
        </DialogHeader>

        {step.kind === 'form' && mode === 'create' && destinations === null && (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading destinations…
          </p>
        )}

        {step.kind === 'form' && mode === 'create' && destinations?.length === 0 && (
          <div className='flex flex-col gap-2 text-sm'>
            <p>Connect Google Sheets in Destinations first.</p>
            <Button variant='outline' className='w-fit' onClick={() => navigate(odmDestinationsPath(projectId))}>
              <ExternalLink className='h-4 w-4' />
              Open Destinations
            </Button>
          </div>
        )}

        {step.kind === 'form' && mode === 'create' && !!destinations?.length && (
          <div className='flex flex-col gap-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Report title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Google Sheets destination
              <NativeSelect aria-label='Google Sheets destination' value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        )}

        {step.kind === 'working' && mode === 'create' && linked ? (
          <div className='flex flex-col gap-2 text-sm'>
            <p className='flex items-center gap-2 text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin text-primary' />
              The report is still running. Open it in ODM to follow its progress.
            </p>
            {openInOdm}
          </div>
        ) : (
          step.kind === 'working' && (
            <p className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin text-primary' />
              {mode === 'create' ? 'Creating the spreadsheet and running the report…' : 'Updating the report and running it…'}
            </p>
          )
        )}

        {step.kind === 'done' && (
          <div className='flex flex-col gap-3 text-sm'>
            <p className='flex items-center gap-2'>
              {step.runStatus === 'SUCCESS' ? <CircleCheckBig className='h-4 w-4 text-success' /> : <TriangleAlert className='h-4 w-4 text-warning' />}
              {doneMessage(step)}
            </p>
            <div className='flex flex-wrap gap-2'>
              {step.linked && (
                <Button variant='outline' onClick={() => openExternal(spreadsheetUrl(step.linked!))}>
                  <ExternalLink className='h-4 w-4' />
                  Open spreadsheet
                </Button>
              )}
              {openInOdm}
            </div>
          </div>
        )}

        {step.kind === 'missing' && (
          <div className='flex flex-col gap-2 text-sm'>
            <p>{step.message}</p>
            <Button
              variant='outline'
              className='w-fit'
              onClick={() => {
                setMode('create');
                setStep({ kind: 'form' });
              }}
            >
              Create a new one
            </Button>
          </div>
        )}

        {step.kind === 'error' && (
          <div className='flex flex-col gap-2 text-sm'>
            <p className='text-destructive'>{step.message}</p>
            {resumed && openInOdm}
          </div>
        )}

        <DialogFooter>
          {step.kind === 'done' || step.kind === 'missing' ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant='outline' disabled={!canClose} onClick={onClose}>
                {step.kind === 'working' ? 'Close' : 'Cancel'}
              </Button>
              {actionMode === 'create' ? (
                <Button disabled={step.kind === 'working' || !destinationId} onClick={() => void create()}>
                  Create report
                </Button>
              ) : (
                <Button
                  disabled={step.kind === 'working'}
                  onClick={() => {
                    setMode('update');
                    void update();
                  }}
                >
                  Update report
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
