import { Info } from 'lucide-react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { aggregationsFor } from '../../lib/aggregation-labels';
import type { AggregateFunction, DateTruncUnit } from '../../lib/odm-types';
import type { DraftColumn, DraftFilter } from '../../lib/report-draft';
import type { FieldInfo } from '../../lib/schema-index';
import { AggregationPopover } from './AggregationPopover';
import { FieldFilterPopover } from './FieldFilterPopover';
import { FieldType } from './FieldType';

export interface FieldRowProps {
  field: FieldInfo;
  /** Accessible name of the checkbox. */
  checkboxLabel: string;
  checked: boolean;
  /** The draft column when the field is selected. */
  column: DraftColumn | undefined;
  filters: DraftFilter[];
  /** The joined data mart's label; absent for main data mart fields. */
  martLabel?: string;
  mainTitle: string;
  onToggle(checked: boolean): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
}

const HOVER_ACTION =
  'text-muted-foreground hover:text-foreground inline-flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100';

export function FieldRow(props: FieldRowProps) {
  const { field, checked, column, martLabel } = props;
  const canAggregate = field.kind === 'date' || aggregationsFor(field).length > 0;
  return (
    // The label owns only the checkbox and stretches up to the actions, so the whole row toggles the
    // field while the action buttons stay outside it: a label may hold just one labelable control.
    <div data-slot='field-row' className='group/row flex min-w-0 items-center gap-2 rounded px-1 py-1 hover:bg-muted/50'>
      <label className='flex min-w-0 flex-1 cursor-pointer items-center gap-2'>
        <Checkbox checked={checked} onCheckedChange={(c) => props.onToggle(c === true)} aria-label={props.checkboxLabel} />
        <span className='min-w-0 truncate font-mono text-xs' title={field.name}>
          {field.label}
        </span>
        <FieldType field={field} />
      </label>
      {/* Fixed height: the actions are conditional, and a row without them must not sit shorter. */}
      <span className='flex h-6 shrink-0 items-center'>
        {field.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type='button' aria-label={`About ${field.label}`} className={HOVER_ACTION}>
                <Info className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs whitespace-pre-wrap'>
              <div className='max-h-64 overflow-y-auto'>{field.description}</div>
            </TooltipContent>
          </Tooltip>
        )}
        {checked && column && canAggregate && (
          <AggregationPopover
            field={field}
            column={column}
            martLabel={martLabel}
            onSetAggregations={props.onSetAggregations}
            onSetDateTrunc={props.onSetDateTrunc}
          />
        )}
        {field.kind !== 'date' && (
          <FieldFilterPopover
            field={field}
            filters={props.filters}
            martLabel={martLabel}
            mainTitle={props.mainTitle}
            onUpsertFilter={props.onUpsertFilter}
            onRemoveFilter={props.onRemoveFilter}
          />
        )}
      </span>
    </div>
  );
}
