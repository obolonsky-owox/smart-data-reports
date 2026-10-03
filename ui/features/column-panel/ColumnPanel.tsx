import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { DataMartPicker } from '../../components/DataMartPicker';
import { NativeSelect } from '../../components/NativeSelect';
import type { StorageSummary } from '../../lib/odm-types';
import { AllFieldsTab, type AllFieldsTabProps } from './AllFieldsTab';
import { SelectedTab, type SelectedTabProps } from './SelectedTab';

export interface ColumnPanelProps
  extends AllFieldsTabProps,
    Omit<SelectedTabProps, 'pendingFilterField'> {
  /** A request to open the filter editor for a field; `nonce` lets the same field be requested twice. */
  filterRequest: { field: string; nonce: number } | null;
  /** Storages with reportable data marts; null when they couldn't be loaded, which hides the storage dropdown. */
  storages: StorageSummary[] | null;
  /** The main data mart's storage. */
  storageId: string | undefined;
  onChangeStorage(storageId: string): void;
  onChangeMain(dataMartId: string): void;
  onApply(): void;
  applyDisabled: boolean;
  applying: boolean;
  issues: string[];
}

export function ColumnPanel(props: ColumnPanelProps) {
  const { index, draft, marts, filterRequest } = props;
  const [tab, setTab] = useState(filterRequest ? 'selected' : 'all');
  const [pendingFilterField, setPendingFilterField] = useState<string | null>(filterRequest?.field ?? null);
  const main = index.instances.get('')!;

  useEffect(() => {
    if (!filterRequest) return;
    setTab('selected');
    setPendingFilterField(filterRequest.field);
  }, [filterRequest]);

  return (
    <div className='flex h-full min-h-0 flex-col bg-background' data-testid='columnPanel'>
      <div className='flex flex-col gap-1 border-b border-border p-3'>
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
        <p className='text-xs text-muted-foreground'>1 row = 1 {main.title}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className='flex min-h-0 flex-1 flex-col'>
        <TabsList className='mx-3 mt-3 grid grid-cols-2'>
          <TabsTrigger value='all'>All</TabsTrigger>
          <TabsTrigger value='selected'>Selected ({draft.columns.length})</TabsTrigger>
        </TabsList>
        <TabsContent value='all' className='min-h-0 flex-1 overflow-y-auto'>
          <AllFieldsTab {...props} />
        </TabsContent>
        <TabsContent value='selected' className='min-h-0 flex-1 overflow-y-auto'>
          <SelectedTab
            {...props}
            pendingFilterField={pendingFilterField}
            onPendingFilterDone={() => {
              setPendingFilterField(null);
              props.onPendingFilterDone();
            }}
          />
        </TabsContent>
      </Tabs>

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
