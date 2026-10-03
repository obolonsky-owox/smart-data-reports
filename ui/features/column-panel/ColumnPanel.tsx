import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { DataMartPicker } from '../../components/DataMartPicker';
import { NativeSelect } from '../../components/NativeSelect';
import type { RelationshipGraph, StorageSummary } from '../../lib/odm-types';
import type { SchemaIndex } from '../../lib/schema-index';
import { AllFieldsTab, type AllFieldsTabProps, type FocusRequest } from './AllFieldsTab';
import { SelectedTab, type SelectedTabProps } from './SelectedTab';

export interface ColumnPanelProps
  extends Omit<AllFieldsTabProps, 'index' | 'graph'>,
    Omit<SelectedTabProps, 'index' | 'graph' | 'pendingFilterField'> {
  /**
   * The main data mart's schema; both are null while it loads. The panel stays mounted meanwhile, so the
   * "Report on" choice keeps its focus, and only the field list shows a placeholder.
   */
  index: SchemaIndex | null;
  graph: RelationshipGraph | null;
  /** A request to open the filter editor for a field; `nonce` lets the same field be requested twice. */
  filterRequest: { field: string; nonce: number } | null;
  /** A request to reveal a join path's data mart in All; `nonce` lets the same path be requested twice. */
  focusRequest?: FocusRequest | null;
  /** Storages with reportable data marts; null when they couldn't be loaded, which hides the storage dropdown. */
  storages: StorageSummary[] | null;
  /** The main data mart's storage. */
  storageId: string | undefined;
  onChangeStorage(storageId: string): void;
  /** `origin` is the control the change came from; a confirmation returns the focus to it. */
  onChangeMain(dataMartId: string, origin: HTMLElement | null): void;
  onApply(): void;
  applyDisabled: boolean;
  applying: boolean;
  issues: string[];
}

export function ColumnPanel(props: ColumnPanelProps) {
  const { index, graph, draft, marts, filterRequest, focusRequest } = props;
  const [tab, setTab] = useState(filterRequest ? 'selected' : 'all');
  const [pendingFilterField, setPendingFilterField] = useState<string | null>(filterRequest?.field ?? null);
  // The panel outlives a main data mart change, but a pending filter belongs to the previous one.
  const [pendingMain, setPendingMain] = useState(draft.mainDataMartId);
  if (pendingMain !== draft.mainDataMartId) {
    setPendingMain(draft.mainDataMartId);
    setPendingFilterField(null);
  }
  const pendingField = pendingFilterField && index?.fields.has(pendingFilterField) ? pendingFilterField : null;
  const mainTitle = index?.instances.get('')!.title ?? marts.find((m) => m.id === draft.mainDataMartId)?.title;

  useEffect(() => {
    if (!filterRequest) return;
    setTab('selected');
    setPendingFilterField(filterRequest.field);
  }, [filterRequest]);

  useEffect(() => {
    if (focusRequest) setTab('all');
  }, [focusRequest]);

  return (
    <div className='flex h-full min-h-0 w-full min-w-0 flex-col bg-background' data-testid='columnPanel'>
      <div className='flex min-w-0 flex-col gap-1 border-b border-border p-3'>
        {props.storages && (
          <>
            <label htmlFor='main-storage' className='text-xs text-muted-foreground'>
              Storage
            </label>
            <NativeSelect id='main-storage' className='mb-2' value={props.storageId} onChange={(e) => props.onChangeStorage(e.target.value)}>
              {props.storages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
        <span className='text-xs text-muted-foreground'>Report on</span>
        <DataMartPicker label='Report on' marts={marts} value={draft.mainDataMartId} onChange={props.onChangeMain} />
        {mainTitle && <p className='truncate text-xs text-muted-foreground'>1 row = 1 {mainTitle}</p>}
      </div>

      {index && graph ? (
        <Tabs value={tab} onValueChange={setTab} className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <TabsList className='mx-3 mt-3 grid grid-cols-2'>
            <TabsTrigger value='all'>All</TabsTrigger>
            <TabsTrigger value='selected'>Selected ({draft.columns.length})</TabsTrigger>
          </TabsList>
          <TabsContent value='all' className='min-h-0 min-w-0 flex-1 overflow-y-auto'>
            <AllFieldsTab {...props} index={index} graph={graph} focusRequest={focusRequest} />
          </TabsContent>
          <TabsContent value='selected' className='min-h-0 min-w-0 flex-1 overflow-y-auto'>
            <SelectedTab
              {...props}
              index={index}
              graph={graph}
              pendingFilterField={pendingField}
              onPendingFilterDone={() => {
                setPendingFilterField(null);
                props.onPendingFilterDone();
              }}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div role='status' aria-label='Loading fields' className='flex min-h-0 flex-1 flex-col gap-2 p-3'>
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-6 w-3/4' />
        </div>
      )}

      <div className='flex flex-col gap-2 border-t border-border p-3'>
        {props.issues.map((issue) => (
          <p key={issue} className='text-xs text-destructive'>
            {issue}
          </p>
        ))}
        <Button className='w-full' disabled={props.applyDisabled} onClick={props.onApply} data-testid='apply'>
          {props.applying && <Loader2 className='h-4 w-4 animate-spin' />}
          Apply
        </Button>
      </div>
    </div>
  );
}
