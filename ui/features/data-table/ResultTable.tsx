import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Sheet, TableProperties, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import type { RunState } from '../editor/use-query-run';
import { formatCell, formatCount, formatDateTime } from '../../lib/format';
import { orderLikeDraft, outputColumns, type OutputColumn, pageCount, pageOf, PAGE_SIZE, splitOutputKey, totalFor } from '../../lib/output-columns';
import { ROW_CAP } from '../../lib/read-plan';
import type { ReportDraft } from '../../lib/report-draft';
import { ColumnHeader, type ColumnHeaderProps } from './ColumnHeader';

export interface ResultTableProps extends Omit<ColumnHeaderProps, 'out'> {
  run: RunState;
  stale: boolean;
  /** The only change since the run is the column order, which the table already shows. */
  reordered?: boolean;
  /** Moves a report column, as the Selected tab's Columns list does. */
  onMoveColumn(from: number, to: number): void;
  /** The report already has a Google Sheets report, so the banner offers to update it. */
  linked?: boolean;
  onCreateSheets(): void;
  onCancel(): void;
  onRetry(): void;
  /** Runs the shown configuration again; offered while the result matches the report. */
  onRefresh(): void;
}

/** A header moves along the header row only. */
const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });

/** Date buckets show their date as the storage cut it; everything else formats as the value says. */
const formatOf = (out: OutputColumn) => ({ dateBucket: !!out.column?.dateTrunc });

function Empty({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className='dm-empty-state'>
      <TableProperties className='dm-empty-state-ico' />
      <h2 className='dm-empty-state-title'>{title}</h2>
      <p className='dm-empty-state-subtitle'>{subtitle}</p>
      {children}
    </div>
  );
}

export function ResultTable(props: ResultTableProps) {
  const { run, stale } = props;
  const [page, setPage] = useState(0);
  const result = run.status === 'success' ? run.result : null;
  useEffect(() => setPage(0), [result]);

  const applied: ReportDraft | null = run.status === 'success' ? run.appliedDraft : null;
  const current = props.draft;
  // The result keeps the run's columns, in the order the report has them now: a reorder needs no new query.
  const columns = useMemo(
    () => (result && applied ? orderLikeDraft(outputColumns(result.rows, applied), current) : []),
    [result, applied, current],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const nameOf = (key: unknown) => columns.find((c) => c.key === key)?.column?.name ?? splitOutputKey(String(key)).base;
    const from = current.columns.findIndex((c) => c.name === nameOf(event.active.id));
    const to = current.columns.findIndex((c) => c.name === nameOf(event.over!.id));
    if (from === -1 || to === -1 || from === to) return;
    props.onMoveColumn(from, to);
  }

  if (run.status === 'idle') {
    return run.cancelled ? (
      <Empty title='Query cancelled' subtitle='Click Apply & Save to run it again.' />
    ) : (
      <Empty title='Pick columns and click Apply & Save' subtitle='Queries run only when you click Apply & Save, so you can set everything up first.' />
    );
  }

  if (run.status === 'running') {
    return (
      <div className='flex flex-col gap-2 py-4' data-testid='running'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin text-primary' />
          Running query…
          <Button variant='outline' size='sm' onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className='h-8 w-full' />
        ))}
      </div>
    );
  }

  if (run.status === 'error') {
    return (
      <Alert variant='destructive' className='my-4'>
        <AlertTitle>{run.error.message}</AlertTitle>
        <AlertDescription>
          {run.error.detail && (
            <details>
              <summary>Details</summary>
              <pre className='whitespace-pre-wrap text-xs'>{run.error.detail}</pre>
            </details>
          )}
          {run.error.retryable && (
            <Button variant='outline' size='sm' className='mt-2' onClick={props.onRetry}>
              <RefreshCw className='h-4 w-4' />
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const rows = run.result.rows;
  const total = rows.length;
  const pages = pageCount(total);
  const visible = pageOf(rows, page);
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const totals = columns.map((out) => totalFor(run.totals, out));

  return (
    <div className='flex min-h-0 flex-col gap-2 py-2'>
      {stale && (
        <p className='text-xs text-muted-foreground'>
          {props.reordered ? 'You reordered the columns. Click Apply & Save to keep the order.' : 'You changed the report. Click Apply & Save to update the result.'}
        </p>
      )}
      {run.rowCount !== undefined && (
        <p className='text-xs text-muted-foreground'>
          Showing the first {formatCount(total)} of {formatCount(run.rowCount)} rows kept from the last run. Refresh to see them all.
        </p>
      )}
      {run.result.truncated && (
        <Alert className='border-warning/40 bg-warning-bg text-warning'>
          <TriangleAlert className='h-4 w-4' />
          <AlertTitle>Showing the first {formatCount(ROW_CAP)} rows.</AlertTitle>
          <AlertDescription className='text-warning'>
            <p>Need more? Create a Google Sheets report with this configuration.</p>
            <Button size='sm' className='mt-2' onClick={props.onCreateSheets}>
              <Sheet className='h-4 w-4' />
              {props.linked ? 'Update Google Sheets' : 'Create Google Sheets report'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {total === 0 ? (
        <Empty title='No rows for this period' subtitle='Try widening the date ranges in Selected.' />
      ) : (
        <>
          {/* Outside the table: dnd-kit adds its screen-reader hints as divs, which a table may not hold. */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={onDragEnd}>
            <div className='dm-card overflow-auto p-0'>
              <table className='w-full text-sm'>
                <thead className='sticky top-0 bg-[var(--table-thead-sticky-bg)]'>
                  <SortableContext items={columns.map((out) => out.key)} strategy={horizontalListSortingStrategy}>
                    <tr>
                      {columns.map((out) => (
                        <ColumnHeader key={out.key} out={out} {...props} />
                      ))}
                    </tr>
                  </SortableContext>
                </thead>
                <tbody>
                  {totals.some(Boolean) && (
                    <tr className='border-y border-border bg-muted/50'>
                      {columns.map((out, i) => {
                        const cell = totals[i];
                        return (
                          <td key={out.key} className='px-3 py-2 text-right font-medium tabular-nums' data-testid={`totals-${out.key}`} title={cell?.others.map((o) => `${o.fn}: ${formatCell(o.value, formatOf(out))}`).join('\n')}>
                            {cell ? formatCell(cell.value, formatOf(out)) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  {visible.map((row, r) => (
                    <tr key={page * PAGE_SIZE + r} className='border-b border-border last:border-b-0'>
                      {columns.map((out) => {
                        const value = row[out.key];
                        const text = formatCell(value, formatOf(out));
                        return (
                          // A converted timestamp keeps the value ODM returned in its tooltip.
                          <td key={out.key} title={typeof value === 'string' && value !== text ? `${text}\n${value}` : text} className={cn('max-w-[320px] truncate px-3 py-2', typeof value === 'number' && 'text-right tabular-nums')}>
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DndContext>
          <div className='flex items-center justify-end gap-2 text-sm text-muted-foreground'>
            <span className='mr-auto flex items-center gap-2'>
              <span>Last updated {formatDateTime(run.ranAt)}</span>
              {!stale && (
                <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={props.onRefresh}>
                  <RefreshCw className='h-4 w-4' />
                  Refresh
                </Button>
              )}
            </span>
            <span>
              {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
            </span>
            <Button variant='ghost' size='icon' aria-label='Previous page' disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button variant='ghost' size='icon' aria-label='Next page' disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
