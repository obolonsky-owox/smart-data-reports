import { useState } from 'react';
import { Filter, Layers, X } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';
import { describeFilter, isFilterValueMissing, newFilterId } from '../../lib/filter-operators';
import type { DraftFilter } from '../../lib/report-draft';
import type { FieldInfo } from '../../lib/schema-index';
import { FilterValueFields, ruleFromInput, ruleInputFor } from './FilterEditor';

type Tab = 'filter' | 'slice';

export interface FieldFilterPopoverProps {
  field: FieldInfo;
  /** The rules already set on this field. */
  filters: DraftFilter[];
  /** The joined data mart's label; absent for main data mart fields. */
  martLabel?: string;
  mainTitle: string;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
}

export function FieldFilterPopover({ field, filters, martLabel, mainTitle, onUpsertFilter, onRemoveFilter }: FieldFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const count = filters.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={`Filter by ${field.label}`}
          className={cn(
            'flex h-6 w-6 items-center justify-center gap-0.5 rounded transition-opacity',
            count > 0
              ? 'text-primary opacity-100'
              : 'text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          )}
        >
          <Filter className='h-4 w-4' />
          {count > 1 && <span className='text-[10px] leading-none font-semibold tabular-nums'>{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        {/* Mounted per opening, so every opening starts with a fresh rule. */}
        <FilterPopoverBody
          field={field}
          filters={filters}
          martLabel={martLabel}
          mainTitle={mainTitle}
          onUpsertFilter={onUpsertFilter}
          onRemoveFilter={onRemoveFilter}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function FilterPopoverBody({ field, filters, martLabel, mainTitle, onUpsertFilter, onRemoveFilter, onClose }: FieldFilterPopoverProps & { onClose(): void }) {
  const joined = field.aliasPath !== '';
  const [tab, setTab] = useState<Tab>(() => (joined && filters.length > 0 && filters.every((f) => f.sliceOnly) ? 'slice' : 'filter'));
  const [input, setInput] = useState(() => ruleInputFor(field));
  const [missing, setMissing] = useState(false);
  const sliceOnly = joined && tab === 'slice';
  const listed = joined ? filters.filter((f) => f.sliceOnly === sliceOnly) : filters;
  const noun = sliceOnly ? 'slice' : 'filter';

  function apply() {
    const rule = ruleFromInput(field, input);
    if (!rule || isFilterValueMissing(rule.option.input, rule.value)) {
      setMissing(true);
      return;
    }
    onUpsertFilter({ id: newFilterId(), column: field.name, aliasPath: field.aliasPath, operator: rule.option.operator, value: rule.value, sliceOnly });
    onClose();
  }

  return (
    <>
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{field.label}</div>
        {martLabel && <div className='text-[11px] text-muted-foreground'>{martLabel}</div>}
      </div>

      {joined && (
        <div className='flex gap-1 rounded-md border border-border p-0.5'>
          {(['filter', 'slice'] as const).map((t) => (
            <button
              key={t}
              type='button'
              aria-pressed={tab === t}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                setTab(t);
                setMissing(false);
              }}
            >
              {t === 'slice' && <Layers className='h-4 w-4' />}
              {t === 'filter' ? 'Filter' : 'Slice'}
            </button>
          ))}
        </div>
      )}

      {sliceOnly && (
        <div className='flex items-start gap-2 rounded bg-muted/40 p-2 text-[11px]'>
          <Layers className='h-4 w-4 shrink-0 text-primary' />
          <div>
            Keeps every {mainTitle} row and filters {martLabel} before the join.
          </div>
        </div>
      )}

      {listed.length > 0 && (
        <div className='space-y-1'>
          <div className='text-sm leading-none font-medium'>{sliceOnly ? 'Active slices' : 'Active filters'}</div>
          {listed.map((f) => {
            const summary = describeFilter(f, field.kind);
            return (
              <div key={f.id} className='flex items-center gap-2 rounded bg-muted/40 px-2 py-1 text-xs'>
                <span className='flex-1 truncate font-mono' title={summary}>
                  {summary}
                </span>
                <Button variant='ghost' size='sm' className='h-6 w-6 p-0' aria-label={`Remove ${noun}`} onClick={() => onRemoveFilter(f.id)}>
                  <X className='h-4 w-4' />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className='flex flex-col gap-2'>
        <FilterValueFields
          field={field}
          input={input}
          onChange={(next) => {
            setInput(next);
            setMissing(false);
          }}
        />
      </div>

      {missing && <p className='text-xs text-destructive'>Value is required</p>}

      <div className='flex justify-end gap-2'>
        <Button variant='outline' size='sm' onClick={onClose}>
          Cancel
        </Button>
        <Button size='sm' onClick={apply}>
          {listed.length > 0 ? 'Add' : 'Apply'}
        </Button>
      </div>
    </>
  );
}
