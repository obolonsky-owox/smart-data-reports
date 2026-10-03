import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Columns3, Loader2, PanelRightClose, PanelRightOpen, RefreshCw, Save, Sheet } from 'lucide-react';
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
import { DataMartPicker } from '../../components/DataMartPicker';
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
import { groupByStorage, loadStorageMembership, type StorageCatalog, type StorageMembership } from '../../lib/storages';
import type { SchemaIndex } from '../../lib/schema-index';
import { ColumnPanel } from '../column-panel/ColumnPanel';
import { DateChoiceDialog } from '../column-panel/DateChoiceDialog';
import { ResultTable } from '../data-table/ResultTable';
import { RelationshipCanvas } from '../canvas/RelationshipCanvas';
import { SheetsReportDialog } from '../sheets/SheetsReportDialog';
import { SqlTab } from '../sql/SqlTab';
import { PanelResizeHandle, usePanelWidth } from './PanelResizeHandle';
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
  /** undefined while loading; null when storages couldn't be loaded, which falls back to one flat list. */
  const [membership, setMembership] = useState<StorageMembership | null | undefined>(undefined);
  const [startStorageId, setStartStorageId] = useState('');
  const [startId, setStartId] = useState('');
  const [dateChoice, setDateChoice] = useState<DateChoice | null>(null);
  const [pendingRemap, setPendingRemap] = useState<PendingRemap | null>(null);
  /** The control that started the change being confirmed; the confirmation hands the focus back to it. */
  const remapOrigin = useRef<HTMLElement | null>(null);
  const [filterRequest, setFilterRequest] = useState<{ field: string; nonce: number } | null>(null);
  const [sheets, setSheets] = useState<'create' | 'update' | null>(null);
  const [tab, setTab] = useState('table');
  /** The side sheet on narrow screens. */
  const [panelOpen, setPanelOpen] = useState(false);
  /** The column panel beside the report on wide screens. */
  const [panelHidden, setPanelHidden] = useState(false);
  const panelWidth = usePanelWidth();
  const [guarded, setGuarded] = useState<GuardedAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
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
      (list) => alive && setMarts(list),
      (error) => alive && setMartsError(describeError(error, 'data marts')),
    );
    loadStorageMembership(api).then(
      (loaded) => alive && setMembership(loaded),
      () => alive && setMembership(null),
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const catalog = useMemo((): StorageCatalog | null => {
    if (!marts || !membership) return null;
    const grouped = groupByStorage(membership.storages, membership.martIdsByStorage, marts);
    // Never hide a data mart: unless every reportable one has a storage, keep the flat list.
    return grouped.groups.length > 0 && grouped.unassigned.length === 0 ? grouped : null;
  }, [marts, membership]);

  const draft = doc.draft;
  const mainMart = useMemo(() => marts?.find((m) => m.id === draft?.mainDataMartId), [marts, draft?.mainDataMartId]);
  const schema = useSchema(api, mainMart);
  const query = useQueryRun(api);
  // Right after the main data mart changes, the loaded schema can still be the old one's.
  const loaded = schema.state.status === 'ready' && schema.state.index.mainDataMartId === draft?.mainDataMartId ? schema.state : null;
  const index: SchemaIndex | null = loaded?.index ?? null;

  // A result (or a running query) belongs to the main data mart it was applied on.
  const mainDataMartId = draft?.mainDataMartId;
  const resetQuery = query.reset;
  useLayoutEffect(() => resetQuery(), [mainDataMartId, resetQuery]);
  // So does a filter request from the table: the new data mart may not have that field.
  const [filterRequestMain, setFilterRequestMain] = useState(mainDataMartId);
  if (filterRequestMain !== mainDataMartId) {
    setFilterRequestMain(mainDataMartId);
    setFilterRequest(null);
  }

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

  /** `origin` defaults to the focused control; a popover's trigger only gets the focus back after a tick. */
  function confirmRemap(remap: PendingRemap, origin?: HTMLElement | null) {
    remapOrigin.current = origin ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPendingRemap(remap);
  }

  async function changeMain(dataMartId: string, origin?: HTMLElement | null) {
    if (!draft || !index || dataMartId === draft.mainDataMartId) return;
    const mart = marts?.find((m) => m.id === dataMartId);
    if (!mart) return;
    try {
      const loaded = await schema.load(mart);
      const result = rebaseOnMain(draft, index, loaded.index);
      if (result.dropped.length) confirmRemap({ title: `Report on ${mart.title}?`, result, labels: labelsOf(result.dropped, index) }, origin);
      else doc.setDraft(result.draft);
    } catch (error) {
      toast.error(describeError(error, mart.title).message);
    }
  }

  function changePath(from: string, to: string) {
    if (!draft || !index) return;
    const result = changeInstancePath(draft, index, from, to);
    if (result.dropped.length) confirmRemap({ title: 'Change the join path?', result, labels: labelsOf(result.dropped, index) });
    else doc.setDraft(result.draft);
  }

  function apply() {
    if (!draft || issues.length) return;
    void query.run(draft.mainDataMartId, draft, mainMart?.title);
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

  const panelShown = narrow ? panelOpen : !panelHidden;
  function togglePanel() {
    if (narrow) setPanelOpen((open) => !open);
    else setPanelHidden((hidden) => !hidden);
  }

  /** `editing` adds the report's actions; only the editor layout has them. */
  const header = (editing = false) => (
    <header className='dm-page-header flex flex-wrap items-center justify-between gap-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={() => (doc.dirty ? setConfirmBack(true) : onBack())} aria-label='Back to reports'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        {draft ? (
          <Input aria-label='Report title' className='dm-page-header-title h-auto border-transparent px-1 shadow-none' value={doc.title} onChange={(e) => doc.setTitle(e.target.value)} />
        ) : (
          <h1 className='dm-page-header-title'>New report</h1>
        )}
      </div>
      {editing && draft && (
        <div className='flex items-center gap-2'>
          <Button variant='outline' disabled={!index || !draft.columns.length || issues.length > 0 || saving} onClick={openSheets}>
            <Sheet className='h-4 w-4' />
            {linked ? 'Update Google Sheets' : 'Create Google Sheets report'}
          </Button>
          {doc.dirty && <span role='status' aria-label='Unsaved changes' className='size-2 rounded-full bg-primary' />}
          <Button disabled={!index || !doc.dirty || saving} onClick={() => guard('save')}>
            {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Save className='h-4 w-4' />}
            {linked ? 'Save and update Google Sheets' : 'Save'}
          </Button>
          <Button variant='ghost' size='icon' aria-label={panelShown ? 'Hide column panel' : 'Show column panel'} onClick={togglePanel}>
            {panelShown ? <PanelRightClose className='h-4 w-4' /> : <PanelRightOpen className='h-4 w-4' />}
          </Button>
        </div>
      )}
      <AlertDialog open={confirmBack} onOpenChange={setConfirmBack}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes to this report haven't been saved and will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Radix focuses Cancel when the dialog opens, so Enter keeps the changes. */}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className='bg-destructive hover:bg-destructive/90' onClick={onBack}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );

  if (doc.status === 'loading' || (!martsError && (!marts || membership === undefined))) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header()}
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
        {header()}
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

  // The start choice: a storage (when known), then one of its reportable data marts.
  const startGroup = catalog?.groups.find((g) => g.storage.id === startStorageId) ?? catalog?.groups[0];
  const startMarts = startGroup?.marts ?? marts ?? [];
  const startMartId = startMarts.some((m) => m.id === startId) ? startId : (startMarts[0]?.id ?? '');
  const startPicker = (action: string, variant: 'default' | 'outline') => (
    <div className='flex w-full max-w-sm flex-col gap-1 text-left'>
      {catalog && startGroup && (
        <>
          <label htmlFor='start-storage' className='text-xs text-muted-foreground'>
            Storage
          </label>
          <NativeSelect
            id='start-storage'
            aria-label='Storage'
            className='mb-2'
            value={startGroup.storage.id}
            onChange={(e) => {
              setStartStorageId(e.target.value);
              setStartId('');
            }}
          >
            {catalog.groups.map((g) => (
              <option key={g.storage.id} value={g.storage.id}>
                {g.storage.title}
              </option>
            ))}
          </NativeSelect>
        </>
      )}
      <span className='text-xs text-muted-foreground'>Data mart</span>
      <div className='flex min-w-0 items-center gap-2'>
        <DataMartPicker label='Data mart' marts={startMarts} value={startMartId} onChange={setStartId} />
        <Button variant={variant} disabled={!startMartId} onClick={() => doc.setDraft(emptyDraft(startMartId))}>
          {action}
        </Button>
      </div>
    </div>
  );

  if (!draft) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header()}
        {startMarts.length === 0 ? (
          <div className='dm-empty-state'>
            <Columns3 className='dm-empty-state-ico' />
            <h2 className='dm-empty-state-title'>No published data marts available for reports</h2>
            <p className='dm-empty-state-subtitle'>Publish a data mart and make it available for reports in OWOX Data Marts, then come back.</p>
          </div>
        ) : (
          <div className='dm-empty-state'>
            <Columns3 className='dm-empty-state-ico' />
            <h2 className='dm-empty-state-title'>Choose the data mart your report is about</h2>
            <p className='dm-empty-state-subtitle'>Each row of the report is one row of this data mart. You can add columns from its joinable data marts next.</p>
            {startPicker('Start', 'default')}
          </div>
        )}
      </div>
    );
  }

  if (!mainMart) {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header()}
        <div className='dm-page-content'>
          <Alert variant='destructive'>
            <AlertTitle>This report's data mart is no longer available for reports.</AlertTitle>
            <AlertDescription>
              <p>It may have been unpublished or hidden from reports. Pick another data mart to start this report again — its columns can't be carried over.</p>
              <div className='mt-2'>{startPicker('Use this data mart', 'outline')}</div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (schema.state.status === 'error') {
    return (
      <div className='dm-page' data-testid='editorPage'>
        {header()}
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

  // While the schema loads, the layout and the column panel stay mounted: only their contents wait.
  const graph = loaded?.graph ?? null;
  const noFields = !!index && index.instances.size === 1 && index.instances.get('')!.fields.length === 0;
  const visibleIssues = index ? issues.filter((i) => i.kind !== 'no-columns').map((i) => describeIssue(i, index)) : [];
  const requestFilter = (field: string) => {
    setFilterRequest({ field, nonce: Date.now() });
    if (narrow) setPanelOpen(true);
    else setPanelHidden(false);
  };

  // The sidebar offers the main data mart's storage; nothing is reachable across storages.
  const mainGroup = catalog?.groups.find((g) => g.storage.id === catalog.storageOf(draft.mainDataMartId));
  const changeStorage = (storageId: string) => {
    const first = catalog?.groups.find((g) => g.storage.id === storageId)?.marts[0];
    if (first) void changeMain(first.id);
  };

  const panel = (
    <ColumnPanel
      index={index}
      graph={graph}
      draft={draft}
      marts={mainGroup?.marts ?? marts!}
      storages={mainGroup ? catalog!.groups.map((g) => g.storage) : null}
      storageId={mainGroup?.storage.id}
      onChangeStorage={changeStorage}
      filterRequest={filterRequest}
      onToggleField={toggleField}
      onChangeInstancePath={changePath}
      onSetAggregations={(column, fns) => edit((d) => setAggregations(d, column, fns))}
      onSetDateTrunc={(column, unit) => edit((d) => setDateTrunc(d, column, unit))}
      onSetDateRange={(column, range) => edit((d, i) => setDateRange(d, i, column, range))}
      onRemoveDateRange={(column) => edit((d) => removeDateRange(d, column))}
      onUpsertFilter={(filter) => edit((d) => upsertFilter(d, filter))}
      onRemoveFilter={(id) => edit((d) => removeFilter(d, id))}
      onMoveColumn={(from, to) => edit((d) => moveColumn(d, from, to))}
      onRemoveColumn={(name) => edit((d) => removeColumn(d, name))}
      onPendingFilterDone={() => setFilterRequest(null)}
      onChangeMain={(id, origin) => void changeMain(id, origin)}
      onApply={apply}
      applyDisabled={!index || issues.length > 0 || (query.state.status === 'success' && !stale)}
      applying={query.state.status === 'running'}
      issues={visibleIssues}
    />
  );

  return (
    <div className='dm-page flex h-full flex-col' data-testid='editorPage'>
      {header(true)}
      <div className='flex min-h-0 flex-1'>
        <main className='dm-page-content min-w-0 flex-1 overflow-auto'>
          {!index || !graph ? (
            <Skeleton className='h-64 w-full' />
          ) : noFields ? (
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
                  linked={!!linked}
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
        {!narrow && !panelHidden && (
          <>
            <PanelResizeHandle width={panelWidth.width} min={panelWidth.min} max={panelWidth.max} onResize={panelWidth.setWidth} />
            {/* The width is the user's drag result, so it is the one inline style here. */}
            <aside className='flex min-w-0 shrink-0' style={{ width: panelWidth.width }}>
              {panel}
            </aside>
          </>
        )}
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

      {dateChoice && index && (
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
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Opened from code, the dialog has no trigger to return to and would leave the focus on the page.
            const origin = remapOrigin.current;
            remapOrigin.current = null;
            if (!origin?.isConnected) return;
            event.preventDefault();
            origin.focus();
          }}
        >
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
