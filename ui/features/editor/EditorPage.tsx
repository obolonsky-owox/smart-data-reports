import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Columns3, Loader2, RefreshCw, Save, Sheet } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Sheet as SidePanel, SheetContent, SheetHeader, SheetTitle } from '@owox/ui/components/sheet';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { useServices } from '../../services';
import { NativeSelect } from '../../components/NativeSelect';
import { describeError, type UserFacingError } from '../../lib/errors';
import type { DataMartSummary } from '../../lib/odm-types';
import { describeIssue, validateDraft } from '../../lib/read-plan';
import {
  addColumn, changeInstancePath, chooseAutoDate, emptyDraft, includePath, moveColumn, rebaseOnMain,
  removeColumn, removeDateRange, removeFilter, removeInstance, setAggregations, setDateRange, setDateTrunc,
  setSort, upsertFilter, type DateChoice, type RemapResult, type ReportDraft,
} from '../../lib/report-draft';
import { configHash } from '../../lib/report-store';
import type { SchemaIndex } from '../../lib/schema-index';
import { ColumnPanel } from '../column-panel/ColumnPanel';
import { DateChoiceDialog } from '../column-panel/DateChoiceDialog';
import { ResultTable } from '../data-table/ResultTable';
import { RelationshipCanvas } from '../canvas/RelationshipCanvas';
import { SheetsReportDialog } from '../sheets/SheetsReportDialog';
import { SqlTab } from '../sql/SqlTab';
import { useQueryRun } from './use-query-run';
import { useReportDocument, type SaveOutcome } from './use-report-document';
import { useSchema } from './use-schema';

interface PendingRemap { title: string; result: RemapResult; labels: string[] }
/** What a non-author was about to do when the overwrite confirmation opened. */
type GuardedAction = 'save' | 'create' | 'update';

const NARROW_QUERY = '(max-width: 899px)';
const isNarrowScreen = () => window.matchMedia?.(NARROW_QUERY).matches ?? false;

const UNDERLINE_LIST = 'h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0';
const UNDERLINE_TRIGGER =
  'flex-none rounded-none border-0 border-b-2 border-transparent px-1 pb-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none';

interface EditorPageProps { reportId?: string; onBack(): void }

export function EditorPage(props: EditorPageProps) {
  // Retrying a failed load remounts the editor, which re-runs both the report and the data mart loads.
  const [attempt, setAttempt] = useState(0);
  return <Editor key={attempt} {...props} onReload={() => setAttempt((n) => n + 1)} />;
}

function Editor({ reportId, onBack, onReload }: EditorPageProps & { onReload(): void }) {
  const { api, theme } = useServices();
  const doc = useReportDocument(reportId);
  const [marts, setMarts] = useState<DataMartSummary[] | null>(null);
  const [martsError, setMartsError] = useState<UserFacingError | null>(null);
  const [startId, setStartId] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice | null>(null);
  const [pendingRemap, setPendingRemap] = useState<PendingRemap | null>(null);
  const [filterRequest, setFilterRequest] = useState<{ field: string; nonce: number } | null>(null);
  const [sheets, setSheets] = useState<'create' | 'update' | null>(null);
  const [tab, setTab] = useState('table');
  const [panelOpen, setPanelOpen] = useState(false);
  const [guarded, setGuarded] = useState<GuardedAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [narrow, setNarrow] = useState(isNarrowScreen);

  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => {
      setNarrow(event.matches);
      if (!event.matches) setPanelOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let alive = true;
    api.listDataMarts().then(
      (list) => {
        if (!alive) return;
        setMarts(list);
        setStartId((current) => current || list[0]?.id || '');
      },
      (error) => alive && setMartsError(describeError(error, 'data marts')),
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const draft = doc.draft;
  const mainMart = useMemo(() => marts?.find((m) => m.id === draft?.mainDataMartId), [marts, draft?.mainDataMartId]);
  const schema = useSchema(api, mainMart);
  const query = useQueryRun(api);
  const index: SchemaIndex | null = schema.state.status === 'ready' ? schema.state.index : null;

  const edit = useCallback(
    (fn: (d: ReportDraft, i: SchemaIndex) => ReportDraft) => {
      if (!index) return;
      doc.setDraft((d) => (d ? fn(d, index) : d));
    },
    [doc, index],
  );

  const labelsOf = (names: string[], i: SchemaIndex) => names.map((n) => i.fields.get(n)?.label ?? n);
  const issues = draft && index ? validateDraft(draft, index) : [];
  const hash = draft ? configHash(draft) : '';
  const applied = query.state.status === 'success' || query.state.status === 'error' ? query.state.appliedHash : null;
  const stale = query.state.status === 'success' && applied !== hash;
  const linked = doc.saved?.linkedReport;

  function toggleField(name: string, checked: boolean) {
    if (!index || !draft) return;
    if (!checked) {
      doc.setDraft(removeColumn(draft, name));
      return;
    }
    const result = addColumn(draft, index, name);
    doc.setDraft(result.draft);
    if (result.dateChoice) setDateChoice(result.dateChoice);
  }

  async function changeMain(dataMartId: string) {
    if (!draft || !index || dataMartId === draft.mainDataMartId) return;
    const mart = marts?.find((m) => m.id === dataMartId);
    if (!mart) return;
    try {
      const loaded = await schema.load(mart);
      const result = rebaseOnMain(draft, index, loaded.index);
      if (result.dropped.length) setPendingRemap({ title: `Report on ${mart.title}?`, result, labels: labelsOf(result.dropped, index) });
      else doc.setDraft(result.draft);
    } catch (error) {
      toast.error(describeError(error, mart.title).message);
    }
  }

  function changePath(from: string, to: string) {
    if (!draft || !index) return;
    const result = changeInstancePath(draft, index, from, to);
    if (result.dropped.length) setPendingRemap({ title: 'Change the join path?', result, labels: labelsOf(result.dropped, index) });
    else doc.setDraft(result.draft);
  }

  function apply() {
    if (!draft || issues.length) return;
    void query.run(draft.mainDataMartId, draft);
  }

  function report(outcome: SaveOutcome) {
    switch (outcome.kind) {
      case 'link-missing':
        toast.warning('The Google Sheets report was deleted in ODM. Create a new one to keep a spreadsheet in sync.');
        break;
      case 'link-dropped':
        toast.warning(`Saved. The Google Sheets report reads the previous data mart, so it's no longer linked. You can create a new Google Sheets report for ${mainMart?.title ?? 'this data mart'}.`);
        break;
      case 'sync-failed':
        toast.warning(`Saved. Google Sheets wasn't updated: ${outcome.message}`);
        break;
      case 'synced':
        if (outcome.runStatus === 'SUCCESS') toast.success('Saved and updated Google Sheets.');
        else toast.error(`Saved, but the Google Sheets run failed${outcome.runError ? `: ${outcome.runError}` : '.'}`);
        break;
      default:
        toast.success('Report saved.');
    }
  }

  async function save(asCopy = false): Promise<boolean> {
    setSaving(true);
    try {
      report(await doc.saveWithSync({ asCopy, hasIssues: issues.length > 0 }));
      return true;
    } catch (error) {
      toast.error(describeError(error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Saving and both Google Sheets flows write the document, so another member's report asks first.
  function perform(action: GuardedAction, asCopy: boolean) {
    if (action === 'save') {
      void save(asCopy);
      return;
    }
    if (!asCopy) {
      setSheets(action);
      return;
    }
    // The copy is the user's own and is not linked to any Google Sheets report yet.
    void save(true).then((ok) => ok && setSheets('create'));
  }

  function guard(action: GuardedAction) {
    if (doc.isAuthor) perform(action, false);
    else setGuarded(action);
  }

  const openSheets = () => guard(linked ? 'update' : 'create');

  const header = (
    <header className='dm-page-header flex flex-wrap items-center justify-between gap-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back to reports'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        {draft ? (
          <Input aria-label='Report title' className='dm-page-header-title h-auto border-transparent px-1 shadow-none' value={doc.title} onChange={(e) => doc.setTitle(e.target.value)} />
        ) : (
          <h1 className='dm-page-header-title'>New report</h1>
        )}
      </div>
      {draft && index && (
        <div className='flex items-center gap-2'>
          <Button variant='outline' disabled={!draft.columns.length || issues.length > 0 || saving} onClick={openSheets}>
            <Sheet className='h-4 w-4' />
            {linked ? 'Update Google Sheets' : 'Create Google Sheets report'}
          </Button>
          {doc.dirty && <span role='status' aria-label='Unsaved changes' className='size-2 rounded-full bg-primary' />}
          <Button disabled={!doc.dirty || saving} onClick={() => guard('save')}>
            {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Save className='h-4 w-4' />}
            {linked ? 'Save and update Google Sheets' : 'Save'}
          </Button>
          {narrow && (
            <Button variant='outline' size='icon' aria-label='Columns' onClick={() => setPanelOpen(true)}>
              <Columns3 className='h-4 w-4' />
            </Button>
          )}
        </div>
      )}
    </header>
  );

  if (doc.status === 'loading' || (!marts && !martsError)) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content flex flex-col gap-2'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </div>
    );
  }

  const fatal = doc.status === 'error' ? doc.error : martsError;
  if (fatal) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>{fatal.message}</AlertTitle>
            {(fatal.detail || fatal.retryable) && (
              <AlertDescription>
                {fatal.detail && (
                  <details>
                    <summary>Details</summary>
                    <pre className='whitespace-pre-wrap text-xs'>{fatal.detail}</pre>
                  </details>
                )}
                {fatal.retryable && (
                  <Button variant='outline' size='sm' className='mt-2' onClick={onReload}>
                    <RefreshCw className='h-4 w-4' />
                    Retry
                  </Button>
                )}
              </AlertDescription>
            )}
          </Alert>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-empty-state'>
          <Columns3 className='dm-empty-state-ico' />
          <h2 className='dm-empty-state-title'>Choose the data mart your report is about</h2>
          <p className='dm-empty-state-subtitle'>Each row of the report is one row of this data mart. You can add columns from its joinable data marts next.</p>
          <div className='flex w-full max-w-sm items-center gap-2'>
            <NativeSelect aria-label='Data mart' value={startId} onChange={(e) => setStartId(e.target.value)}>
              {marts!.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </NativeSelect>
            <Button disabled={!startId} onClick={() => doc.setDraft(emptyDraft(startId))}>
              Start
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!mainMart) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>This report's data mart is no longer available for reports.</AlertTitle>
            <AlertDescription>
              <p>It may have been unpublished or hidden from reports. Pick another data mart to start this report again — its columns can't be carried over.</p>
              <div className='mt-2 flex w-full max-w-sm items-center gap-2'>
                <NativeSelect aria-label='Data mart' value={startId} onChange={(e) => setStartId(e.target.value)}>
                  {marts!.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </NativeSelect>
                <Button variant='outline' disabled={!startId} onClick={() => doc.setDraft(emptyDraft(startId))}>
                  Use this data mart
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (schema.state.status === 'error') {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>Couldn't load {mainMart?.title ?? 'this data mart'}</AlertTitle>
            <AlertDescription>
              <p>{schema.state.error.message}</p>
              <Button variant='outline' size='sm' className='mt-2' onClick={schema.reload}>
                <RefreshCw className='h-4 w-4' />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!index || schema.state.status !== 'ready') {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header}
        <div className='dm-page-content'>
          <Skeleton className='h-64 w-full' />
        </div>
      </div>
    );
  }

  const graph = schema.state.graph;
  const noFields = index.instances.size === 1 && index.instances.get('')!.fields.length === 0;
  const visibleIssues = issues.filter((i) => i.kind !== 'no-columns').map((i) => describeIssue(i, index));
  const requestFilter = (field: string) => {
    setFilterRequest({ field, nonce: Date.now() });
    // On wide screens the panel is already visible; the side sheet is only for narrow ones.
    if (narrow) setPanelOpen(true);
  };

  const panel = (
    <ColumnPanel
      index={index}
      draft={draft}
      marts={marts!}
      filterRequest={filterRequest}
      onToggleField={toggleField}
      onIncludePath={(path) => edit((d) => includePath(d, path))}
      onChangeInstancePath={changePath}
      onAddFilter={requestFilter}
      onSetDateRange={(column, range) => edit((d, i) => setDateRange(d, i, column, range))}
      onRemoveDateRange={(column) => edit((d) => removeDateRange(d, column))}
      onUpsertFilter={(filter) => edit((d) => upsertFilter(d, filter))}
      onRemoveFilter={(id) => edit((d) => removeFilter(d, id))}
      onMoveColumn={(from, to) => edit((d) => moveColumn(d, from, to))}
      onRemoveColumn={(name) => edit((d) => removeColumn(d, name))}
      onPendingFilterDone={() => setFilterRequest(null)}
      onChangeMain={(id) => void changeMain(id)}
      onApply={apply}
      applyDisabled={issues.length > 0 || (query.state.status === 'success' && !stale)}
      applying={query.state.status === 'running'}
      issues={visibleIssues}
    />
  );

  return (
    <div className='dm-page flex h-full flex-col' data-testid='editorPage'>
      {header}
      <div className='flex min-h-0 flex-1'>
        <main className='dm-page-content min-w-0 flex-1 overflow-auto'>
          {noFields ? (
            <div className='dm-empty-state'>
              <h2 className='dm-empty-state-title'>This data mart has no fields available for reports</h2>
              <p className='dm-empty-state-subtitle'>Ask its owner to make fields visible for reporting, or pick another data mart.</p>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className={UNDERLINE_LIST}>
                <TabsTrigger value='table' className={UNDERLINE_TRIGGER}>Data table</TabsTrigger>
                <TabsTrigger value='canvas' className={UNDERLINE_TRIGGER}>Entity relationship</TabsTrigger>
                <TabsTrigger value='sql' className={UNDERLINE_TRIGGER}>SQL</TabsTrigger>
              </TabsList>
              <TabsContent value='table'>
                <ResultTable
                  index={index}
                  draft={draft}
                  run={query.state}
                  stale={stale}
                  onSort={(column, direction) => edit((d) => setSort(d, column, direction))}
                  onSetAggregations={(column, fns) => edit((d) => setAggregations(d, column, fns))}
                  onSetDateTrunc={(column, unit) => edit((d) => setDateTrunc(d, column, unit))}
                  onEditFilter={requestFilter}
                  onRemoveFilter={(id) => edit((d) => removeFilter(d, id))}
                  onCreateSheets={openSheets}
                  onCancel={query.cancel}
                  onRetry={apply}
                />
              </TabsContent>
              <TabsContent value='canvas'>
                <RelationshipCanvas
                  index={index}
                  graph={graph}
                  draft={draft}
                  theme={theme}
                  onAddObject={(path) => edit((d) => includePath(d, path))}
                  onSetMain={(id) => void changeMain(id)}
                  onDeleteInstance={(path) => edit((d) => removeInstance(d, path))}
                />
              </TabsContent>
              <TabsContent value='sql'>
                <SqlTab
                  linked={linked}
                  draftChanged={!!linked && linked.syncedDraftHash !== hash}
                  reportTitle={doc.title}
                  onCreateSheets={() => guard('create')}
                  onUpdateSheets={() => guard('update')}
                />
              </TabsContent>
            </Tabs>
          )}
        </main>
        {!narrow && <aside className='flex w-[380px] shrink-0 border-l border-border'>{panel}</aside>}
      </div>

      {narrow && (
        <SidePanel open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent className='w-full p-0 sm:min-w-[400px]'>
            <SheetHeader className='border-b border-border p-4'>
              <SheetTitle>Columns</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </SidePanel>
      )}

      {dateChoice && (
        <DateChoiceDialog
          choice={dateChoice}
          index={index}
          onChoose={(column) => {
            edit((d, i) => chooseAutoDate(d, i, dateChoice.aliasPath, column));
            setDateChoice(null);
          }}
        />
      )}

      <AlertDialog open={!!pendingRemap} onOpenChange={(open) => !open && setPendingRemap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRemap?.title}</AlertDialogTitle>
            <AlertDialogDescription>These can't be kept and will be removed: {pendingRemap?.labels.join(', ')}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive hover:bg-destructive/90'
              onClick={() => {
                if (pendingRemap) doc.setDraft(pendingRemap.result.draft);
                setPendingRemap(null);
              }}
            >
              Remove and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!guarded} onOpenChange={(open) => !open && setGuarded(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This report belongs to another member</AlertDialogTitle>
            <AlertDialogDescription>
              {guarded === 'save'
                ? 'Save your changes as your own copy, or overwrite their report for everyone.'
                : 'Creating or updating a Google Sheets report saves this report. Continue with your own copy, or overwrite their report for everyone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Radix focuses Cancel when the dialog opens, so Enter never overwrites. */}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant='destructive'
              onClick={() => {
                if (guarded) perform(guarded, false);
                setGuarded(null);
              }}
            >
              Overwrite
            </Button>
            <AlertDialogAction onClick={() => guarded && perform(guarded, true)}>Save as copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sheets && (
        <SheetsReportDialog
          mode={sheets}
          defaultTitle={doc.title}
          dataMartId={draft.mainDataMartId}
          linked={linked}
          onCreate={(input) => doc.createSheetsReport(input)}
          onUpdate={() => doc.updateSheetsReport({ hasIssues: issues.length > 0 })}
          onClose={() => setSheets(null)}
        />
      )}
    </div>
  );
}
