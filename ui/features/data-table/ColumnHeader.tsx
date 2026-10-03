import { ArrowDown, ArrowUp, EllipsisVertical, X } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { cn } from '@owox/ui/lib/utils';
import type { AggregateFunction, DateTruncUnit, RelationshipGraph } from '../../lib/odm-types';
import type { OutputColumn } from '../../lib/output-columns';
import { aggregationsFor, FN_LABEL, TRUNC_OPTIONS } from '../../lib/aggregation-labels';
import { describeFilter, filterKind } from '../../lib/filter-operators';
import type { ReportDraft } from '../../lib/report-draft';
import type { SchemaIndex } from '../../lib/schema-index';
import { MartLabel } from '../column-panel/MartLabel';

export interface ColumnHeaderProps {
  out: OutputColumn;
  index: SchemaIndex;
  /** Supplies the join path shown when a column's data mart is hovered. */
  graph: RelationshipGraph;
  draft: ReportDraft;
  onSort(column: string, direction: 'asc' | 'desc' | null): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onEditFilter(column: string): void;
  onRemoveFilter(id: string): void;
}

export function ColumnHeader({ out, index, graph, draft, onSort, onSetAggregations, onSetDateTrunc, onEditFilter, onRemoveFilter }: ColumnHeaderProps) {
  const name = out.column?.name;
  const field = name ? index.fields.get(name) : undefined;
  const sortAt = draft.sorts.findIndex((s) => s.column === name);
  const sort = draft.sorts[sortAt];
  const filters = draft.filters.filter((f) => f.column === name);
  const label = field?.label ?? out.key;
  const current = draft.columns.find((c) => c.name === name);
  const aggregations = field ? aggregationsFor(field) : [];

  return (
    <th scope='col' className='min-w-[140px] px-3 py-2 text-left align-top font-normal'>
      <div className='flex items-start gap-1'>
        <span className={cn('flex items-center gap-1 font-medium', sort && 'text-primary')}>
          {sort && (sort.direction === 'asc' ? <ArrowUp className='h-4 w-4' /> : <ArrowDown className='h-4 w-4' />)}
          {sort && draft.sorts.length > 1 && <sup>{sortAt + 1}</sup>}
          {label}
        </span>
        {name && field && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='size-6' aria-label={`Column options for ${label}`}>
                <EllipsisVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-52'>
              {field.kind !== 'date' && <DropdownMenuItem onSelect={() => onEditFilter(name)}>Filter…</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sort</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort?.direction ?? 'none'} onValueChange={(v) => onSort(name, v === 'none' ? null : (v as 'asc' | 'desc'))}>
                <DropdownMenuRadioItem value='asc'>A → Z</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='desc'>Z → A</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='none'>Unsorted</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {aggregations.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Aggregation</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={out.fn ?? current?.aggregations?.[0] ?? 'none'}
                    onValueChange={(v) => onSetAggregations(name, v === 'none' ? undefined : [v as AggregateFunction])}
                  >
                    {/* HTTP Data cannot opt out of ODM's automatic aggregation, so None is hidden then. */}
                    {!out.automatic && <DropdownMenuRadioItem value='none'>None</DropdownMenuRadioItem>}
                    {aggregations.map((fn) => (
                      <DropdownMenuRadioItem key={fn} value={fn}>
                        {FN_LABEL[fn]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
              {field.kind === 'date' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Date bucket</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={current?.dateTrunc ?? 'FULL'} onValueChange={(v) => onSetDateTrunc(name, v === 'FULL' ? undefined : (v as DateTruncUnit))}>
                    {TRUNC_OPTIONS.map((t) => (
                      <DropdownMenuRadioItem key={t.unit} value={t.unit}>
                        {t.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {/* The field first, then the data mart it comes from; a joined one previews its join path on hover. */}
      {field && <MartLabel index={index} graph={graph} aliasPath={field.aliasPath} className='block max-w-full self-start' />}
      {out.fn && (
        <div className='text-xs text-muted-foreground'>
          {out.fn}
          {out.automatic && ' · Automatic'}
        </div>
      )}
      {current?.dateTrunc && <div className='text-xs text-primary'>{TRUNC_OPTIONS.find((t) => t.unit === current.dateTrunc)?.label}</div>}
      {filters.map((f) => (
        <span key={f.id} className='mt-1 inline-flex items-center gap-1 text-xs text-foreground'>
          {describeFilter(f, field && filterKind(field, f.sliceOnly))}
          <button type='button' aria-label={`Remove filter ${label}`} className='text-muted-foreground hover:text-foreground' onClick={() => onRemoveFilter(f.id)}>
            <X className='h-4 w-4' />
          </button>
        </span>
      ))}
    </th>
  );
}
