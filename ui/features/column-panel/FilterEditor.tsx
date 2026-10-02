import { useState, type FormEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { NativeSelect } from '../../components/NativeSelect';
import { coerceFilterValue, newFilterId, operatorsFor } from '../../lib/filter-operators';
import type { DraftFilter, FilterOperator } from '../../lib/report-draft';
import type { FieldInfo } from '../../lib/schema-index';

interface FilterEditorProps {
  field: FieldInfo;
  instanceLabel: string;
  mainTitle: string;
  isJoined: boolean;
  filter?: DraftFilter;
  onSave(filter: DraftFilter): void;
  onCancel(): void;
}

export function FilterEditor({ field, instanceLabel, mainTitle, isJoined, filter, onSave, onCancel }: FilterEditorProps) {
  const options = operatorsFor(field.kind);
  const [operator, setOperator] = useState<FilterOperator | undefined>(filter?.operator ?? options[0]?.operator);
  const option = options.find((o) => o.operator === operator);
  const initialRange = (filter?.value as { from?: unknown; to?: unknown } | undefined) ?? {};
  const [single, setSingle] = useState(filter && !Array.isArray(filter.value) && typeof filter.value !== 'object' ? String(filter.value ?? '') : '');
  const [list, setList] = useState(Array.isArray(filter?.value) ? (filter.value as unknown[]).join('\n') : '');
  const [range, setRange] = useState({ from: String(initialRange.from ?? ''), to: String(initialRange.to ?? '') });
  const [sliceOnly, setSliceOnly] = useState(filter?.sliceOnly ?? false);

  if (!option) return <p className='px-3 text-xs text-muted-foreground'>This field can't be filtered here.</p>;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!option) return;
    const raw = option.input === 'range' ? range : option.input === 'list' ? list : single;
    onSave({
      id: filter?.id ?? newFilterId(),
      column: field.name,
      aliasPath: field.aliasPath,
      operator: option.operator,
      value: coerceFilterValue(field.kind, option.input, raw),
      sliceOnly: isJoined && sliceOnly,
    });
  }

  return (
    <form aria-label={`Filter ${field.label}`} onSubmit={submit} className='flex flex-col gap-2 rounded-md border border-border bg-card p-3'>
      <NativeSelect aria-label='Operator' value={operator} onChange={(e) => setOperator(e.target.value as FilterOperator)}>
        {options.map((o) => (
          <option key={o.operator} value={o.operator}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {option.input === 'single' && (
        <Input aria-label='Value' className='h-8' value={single} inputMode={field.kind === 'number' ? 'decimal' : undefined} onChange={(e) => setSingle(e.target.value)} />
      )}
      {option.input === 'list' && (
        <textarea
          aria-label='Values'
          rows={3}
          placeholder='One value per line or comma-separated'
          className='rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'
          value={list}
          onChange={(e) => setList(e.target.value)}
        />
      )}
      {option.input === 'range' && (
        <div className='flex items-center gap-1'>
          <Input aria-label='From' className='h-8' value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className='text-muted-foreground'>–</span>
          <Input aria-label='To' className='h-8' value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      )}
      {isJoined && (
        <label className='flex items-start gap-2 text-sm'>
          <Switch checked={sliceOnly} onCheckedChange={setSliceOnly} aria-label={`Only narrow ${instanceLabel}`} />
          <span>
            Only narrow {instanceLabel}
            <span className='block text-xs text-muted-foreground'>Keeps every {mainTitle} row and filters {instanceLabel} before the join.</span>
          </span>
        </label>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' size='sm' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='submit' size='sm'>
          Save filter
        </Button>
      </div>
    </form>
  );
}
