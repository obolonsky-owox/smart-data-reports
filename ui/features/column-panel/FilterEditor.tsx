import { useState, type KeyboardEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { NativeSelect } from '../../components/NativeSelect';
import { coerceFilterValue, filterKind, newFilterId, operatorsFor, type OperatorOption } from '../../lib/filter-operators';
import type { DraftFilter, FilterOperator } from '../../lib/report-draft';
import type { FieldInfo, FieldKind } from '../../lib/schema-index';

/** What the operator select and value inputs hold while a rule is being edited. */
export interface RuleInput {
  operator: FilterOperator | undefined;
  single: string;
  list: string;
  range: { from: string; to: string };
}

/** `kind` is what the rule compares against; see `filterKind`. */
export function ruleInputFor(kind: FieldKind, filter?: DraftFilter): RuleInput {
  const value = filter?.value;
  const range = (value as { from?: unknown; to?: unknown } | undefined) ?? {};
  return {
    operator: filter?.operator ?? operatorsFor(kind)[0]?.operator,
    single: filter && !Array.isArray(value) && typeof value !== 'object' ? String(value ?? '') : '',
    list: Array.isArray(value) ? (value as unknown[]).join('\n') : '',
    range: { from: String(range.from ?? ''), to: String(range.to ?? '') },
  };
}

/** The chosen operator and the value coerced for it, or undefined when the kind has no such operator. */
export function ruleFromInput(kind: FieldKind, input: RuleInput): { option: OperatorOption; value: unknown } | undefined {
  const option = operatorsFor(kind).find((o) => o.operator === input.operator);
  if (!option) return undefined;
  const raw = option.input === 'range' ? input.range : option.input === 'list' ? input.list : input.single;
  return { option, value: coerceFilterValue(kind, option.input, raw) };
}

/** The input kept when a rule switches between filter and slice, or a fresh one when its operator no longer applies. */
export function ruleInputForKind(kind: FieldKind, input: RuleInput): RuleInput {
  return operatorsFor(kind).some((o) => o.operator === input.operator) ? input : ruleInputFor(kind);
}

/** Operator select plus the value inputs the operator needs. */
export function FilterValueFields({ kind, input, onChange }: { kind: FieldKind; input: RuleInput; onChange(next: RuleInput): void }) {
  const options = operatorsFor(kind);
  const option = options.find((o) => o.operator === input.operator);
  return (
    <>
      <NativeSelect aria-label='Operator' value={input.operator} onChange={(e) => onChange({ ...input, operator: e.target.value as FilterOperator })}>
        {options.map((o) => (
          <option key={o.operator} value={o.operator}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {option?.input === 'single' && (
        <Input
          aria-label='Value'
          className='h-8'
          value={input.single}
          inputMode={kind === 'number' ? 'decimal' : undefined}
          onChange={(e) => onChange({ ...input, single: e.target.value })}
        />
      )}
      {option?.input === 'list' && (
        <textarea
          aria-label='Values'
          rows={3}
          placeholder='One value per line or comma-separated'
          className='rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'
          value={input.list}
          onChange={(e) => onChange({ ...input, list: e.target.value })}
        />
      )}
      {option?.input === 'range' && (
        <div className='flex items-center gap-1'>
          <Input aria-label='From' className='h-8' value={input.range.from} onChange={(e) => onChange({ ...input, range: { ...input.range, from: e.target.value } })} />
          <span className='text-muted-foreground'>–</span>
          <Input aria-label='To' className='h-8' value={input.range.to} onChange={(e) => onChange({ ...input, range: { ...input.range, to: e.target.value } })} />
        </div>
      )}
    </>
  );
}

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
  const [sliceOnly, setSliceOnly] = useState(filter?.sliceOnly ?? false);
  const kind = filterKind(field, isJoined && sliceOnly);
  const [input, setInput] = useState(() => ruleInputFor(kind, filter));

  const rule = ruleFromInput(kind, input);

  function changeSliceOnly(next: boolean) {
    setSliceOnly(next);
    setInput((current) => ruleInputForKind(filterKind(field, isJoined && next), current));
  }
  if (!rule) return <p className='px-3 text-xs text-muted-foreground'>This field can't be filtered here.</p>;

  function save() {
    if (!rule) return;
    onSave({
      id: filter?.id ?? newFilterId(),
      column: field.name,
      aliasPath: field.aliasPath,
      operator: rule.option.operator,
      value: rule.value,
      sliceOnly: isJoined && sliceOnly,
    });
  }

  // Enter in a single-line input saves, like a form would; a textarea keeps Enter for new lines.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    save();
  }

  // Not a <form>: ODM sandboxes the plugin iframe without `allow-forms`, and the browser
  // blocks form submission there before a submit event ever fires.
  return (
    <div role='form' aria-label={`Filter ${field.label}`} onKeyDown={onKeyDown} className='flex flex-col gap-2 rounded-md border border-border bg-card p-3'>
      <FilterValueFields kind={kind} input={input} onChange={setInput} />
      {isJoined && (
        <label className='flex items-start gap-2 text-sm'>
          <Switch checked={sliceOnly} onCheckedChange={changeSliceOnly} aria-label={`Only narrow ${instanceLabel}`} />
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
        <Button type='button' size='sm' onClick={save}>
          Save filter
        </Button>
      </div>
    </div>
  );
}
