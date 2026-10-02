import { useId, useState } from 'react';
import { Sigma } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';
import { NativeSelect } from '../../components/NativeSelect';
import { aggregationsFor, FN_LABEL, TRUNC_OPTIONS } from '../../lib/aggregation-labels';
import type { AggregateFunction, DateTruncUnit } from '../../lib/odm-types';
import type { DraftColumn } from '../../lib/report-draft';
import type { FieldInfo } from '../../lib/schema-index';

export interface AggregationPopoverProps {
  field: FieldInfo;
  column: DraftColumn;
  /** The joined data mart's label; absent for main data mart fields. */
  martLabel?: string;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
}

export function AggregationPopover({ field, column, martLabel, onSetAggregations, onSetDateTrunc }: AggregationPopoverProps) {
  const [open, setOpen] = useState(false);
  const active = !!column.aggregations?.length || !!column.dateTrunc;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={`Aggregation for ${field.label}`}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded transition-opacity',
            active
              ? 'text-primary opacity-100'
              : 'text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          )}
        >
          <Sigma className='h-4 w-4' />
        </button>
      </PopoverTrigger>
      <PopoverContent className='w-72 space-y-3'>
        {/* Mounted per opening, so every opening starts from the column's current settings. */}
        <AggregationEditor
          field={field}
          column={column}
          martLabel={martLabel}
          onApply={(fns, unit) => {
            onSetAggregations(field.name, fns);
            if (field.kind === 'date') onSetDateTrunc(field.name, unit);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

interface AggregationEditorProps {
  field: FieldInfo;
  column: DraftColumn;
  martLabel?: string;
  onApply(fns: AggregateFunction[] | undefined, unit: DateTruncUnit | undefined): void;
  onCancel(): void;
}

function AggregationEditor({ field, column, martLabel, onApply, onCancel }: AggregationEditorProps) {
  const bucketId = useId();
  const isDate = field.kind === 'date';
  const allowed = aggregationsFor(field);
  const [fns, setFns] = useState<AggregateFunction[]>(column.aggregations ?? []);
  // A bucket and aggregate functions are mutually exclusive: a bucketed date is a dimension.
  const [bucket, setBucket] = useState<DateTruncUnit | undefined>(isDate ? column.dateTrunc : undefined);
  const chosen = bucket ? [] : allowed.filter((fn) => fns.includes(fn));
  // Something must be chosen, unless the column had settings: then an empty Apply removes them.
  const canApply = chosen.length > 0 || !!bucket || !!column.aggregations?.length || !!column.dateTrunc;

  function toggle(fn: AggregateFunction, checked: boolean) {
    setBucket(undefined);
    setFns((prev) => (checked ? [...prev.filter((f) => f !== fn), fn] : prev.filter((f) => f !== fn)));
  }

  function chooseBucket(value: string) {
    setFns([]);
    setBucket(value === 'FULL' ? undefined : (value as DateTruncUnit));
  }

  return (
    <>
      <div>
        <div className='text-sm font-medium'>{field.label}</div>
        {martLabel && <div className='text-[11px] text-muted-foreground'>{martLabel}</div>}
      </div>

      {isDate && (
        <div className='space-y-1'>
          <label htmlFor={bucketId} className='text-sm leading-none font-medium'>
            Group by bucket
          </label>
          <NativeSelect id={bucketId} value={bucket ?? 'FULL'} onChange={(e) => chooseBucket(e.target.value)}>
            {TRUNC_OPTIONS.map((t) => (
              <option key={t.unit} value={t.unit}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {allowed.length > 0 && (
        <div className='space-y-1'>
          <div className='text-sm leading-none font-medium'>{isDate ? 'Or aggregate by' : 'Aggregate by'}</div>
          <div className='max-h-48 space-y-1 overflow-y-auto'>
            {allowed.map((fn) => (
              <label key={fn} className='flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50'>
                <Checkbox checked={chosen.includes(fn)} onCheckedChange={(c) => toggle(fn, c === true)} aria-label={FN_LABEL[fn]} />
                <span>{FN_LABEL[fn]}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className='flex justify-end gap-2'>
        <Button variant='outline' size='sm' onClick={onCancel}>
          Cancel
        </Button>
        <Button size='sm' disabled={!canApply} onClick={() => onApply(chosen.length ? chosen : undefined, bucket)}>
          Apply
        </Button>
      </div>
    </>
  );
}
