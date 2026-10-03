import { useState, type ReactNode } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { FN_LABEL, TRUNC_OPTIONS } from '../../lib/aggregation-labels';
import { AUTO_DATE_RANGE, usedInstances, type DraftColumn, type DraftFilter, type ReportDraft } from '../../lib/report-draft';
import type { DateRangeValue } from '../../lib/date-ranges';
import { describeFilter, filterKind } from '../../lib/filter-operators';
import type { AggregateFunction, DateTruncUnit, RelationshipGraph } from '../../lib/odm-types';
import { dateFields, type SchemaIndex } from '../../lib/schema-index';
import { AggregationPopover } from './AggregationPopover';
import { DateRangeEditor } from './DateRangeEditor';
import { FieldType } from './FieldType';
import { FilterEditor } from './FilterEditor';
import { MartLabel } from './MartLabel';
import { dateRangePlacement, filterPlacement } from '../../lib/placement';
import { PlacementMarker } from './PlacementMarker';

export interface SelectedTabProps {
  index: SchemaIndex;
  /** Supplies the join keys shown when a data mart label is hovered. */
  graph: RelationshipGraph;
  draft: ReportDraft;
  pendingFilterField: string | null;
  onPendingFilterDone(): void;
  onSetDateRange(column: string, range: DateRangeValue): void;
  onRemoveDateRange(column: string): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onMoveColumn(from: number, to: number): void;
  onRemoveColumn(name: string): void;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className='flex min-w-0 flex-col gap-1 border-b border-border py-2 last:border-b-0'>
      <div className='flex min-h-7 items-center justify-between px-3'>
        <h3 className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A block inside a section, e.g. Date ranges inside Filters & Slices. */
function Subsection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className='flex min-w-0 flex-col gap-1 pb-1'>
      <div className='flex min-h-7 items-center justify-between px-3'>
        <h4 className='text-xs font-medium text-foreground'>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** `Sum, Average` or the date bucket, as the column picker names them. */
function describeAggregation(column: DraftColumn): string {
  if (column.dateTrunc) return `${TRUNC_OPTIONS.find((t) => t.unit === column.dateTrunc)?.label ?? column.dateTrunc} bucket`;
  return (column.aggregations ?? []).map((fn) => FN_LABEL[fn]).join(', ');
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    // dnd-kit positions the dragged row through a transform; that is the one inline style here.
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className='flex min-w-0 items-center gap-2 px-3 py-1'>
      <button type='button' aria-label='Drag to reorder' className='shrink-0 cursor-grab text-muted-foreground' {...attributes} {...listeners}>
        <GripVertical className='h-4 w-4' />
      </button>
      {children}
    </li>
  );
}

export function SelectedTab(props: SelectedTabProps) {
  const { index, graph, draft, pendingFilterField, onPendingFilterDone } = props;
  const [editingFilter, setEditingFilter] = useState<string | null>(null);
  const [newFilterField, setNewFilterField] = useState<string | null>(null);
  const [menu, setMenu] = useState<'date' | 'filter' | null>(null);
  const menuProps = (name: 'date' | 'filter') => ({ open: menu === name, onOpenChange: (open: boolean) => setMenu(open ? name : null) });
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const main = index.instances.get('')!;
  const used = usedInstances(draft).map((p) => index.instances.get(p)).filter((i) => i !== undefined);
  const martLabel = (aliasPath: string) => index.instances.get(aliasPath)?.label ?? 'Unavailable';
  const fieldLabel = (name: string) => index.fields.get(name)?.label ?? name;
  const ranged = new Set(draft.dateRanges.map((r) => r.column));
  const addableDates = used.flatMap((i) => dateFields(i).filter((f) => !ranged.has(f.name)));
  const filterable = used.flatMap((i) => i.fields.filter((f) => f.kind !== 'date'));
  const creatingField = pendingFilterField ?? newFilterField;
  const creating = creatingField ? index.fields.get(creatingField) : undefined;
  const names = draft.columns.map((c) => c.name);
  const aggregated = draft.columns.filter((c) => c.aggregations?.length || c.dateTrunc);
  const martOf = (aliasPath: string, className?: string) => <MartLabel index={index} graph={graph} aliasPath={aliasPath} className={className} />;

  const closeNewFilter = () => {
    setNewFilterField(null);
    if (pendingFilterField) onPendingFilterDone();
  };

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    props.onMoveColumn(names.indexOf(String(event.active.id)), names.indexOf(String(event.over.id)));
  }

  return (
    <div className='flex min-w-0 flex-col'>
      <Section title='Filters & Slices'>
        <Subsection
          title='Date ranges'
          action={
            addableDates.length > 0 && (
              <Popover {...menuProps('date')}>
                <PopoverTrigger asChild>
                  <Button variant='ghost' size='sm' className='h-7 text-xs'>
                    <Plus className='h-4 w-4' />
                    Date
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-64 p-1'>
                  {addableDates.map((f) => (
                    <button
                      key={f.name}
                      type='button'
                      className='flex w-full justify-between rounded-sm px-2 py-1 text-left text-sm hover:bg-accent'
                      onClick={() => {
                        props.onSetDateRange(f.name, AUTO_DATE_RANGE);
                        setMenu(null);
                      }}
                    >
                      {f.label}
                      <span className='text-xs text-muted-foreground'>{martLabel(f.aliasPath)}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          }
        >
          {draft.dateRanges.length === 0 && <p className='px-3 text-xs text-muted-foreground'>No periods. The report reads all time.</p>}
          {draft.dateRanges.map((range) => {
            const field = index.fields.get(range.column);
            return (
              <div key={range.column} className='flex items-start gap-2 px-3 py-1'>
                <div className='flex min-w-0 flex-1 flex-col gap-1'>
                  <div className='flex min-w-0 items-center justify-between gap-2 text-sm'>
                    <span className='flex min-w-0 items-center gap-1'>
                      <span className='min-w-0 truncate'>{fieldLabel(range.column)}</span>
                      {field && <FieldType field={field} />}
                    </span>
                    <span className='flex min-w-0 items-center gap-1'>
                      {martOf(range.aliasPath)}
                      <PlacementMarker placement={dateRangePlacement(range.aliasPath)} kind='period' mainLabel={main.title} instanceLabel={martLabel(range.aliasPath)} />
                    </span>
                  </div>
                  <DateRangeEditor value={range.range} label={fieldLabel(range.column)} onChange={(value) => props.onSetDateRange(range.column, value)} />
                </div>
                <Button variant='ghost' size='icon' className='size-7 shrink-0' aria-label={`Remove date range ${fieldLabel(range.column)}`} onClick={() => props.onRemoveDateRange(range.column)}>
                  <X className='h-4 w-4' />
                </Button>
              </div>
            );
          })}
        </Subsection>

        <Subsection
          title='Filters'
          action={
            filterable.length > 0 && (
              <Popover {...menuProps('filter')}>
                <PopoverTrigger asChild>
                  <Button variant='ghost' size='sm' className='h-7 text-xs'>
                    <Plus className='h-4 w-4' />
                    Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='max-h-72 w-64 overflow-y-auto p-1'>
                  {filterable.map((f) => (
                    <button
                      key={f.name}
                      type='button'
                      className='flex w-full justify-between rounded-sm px-2 py-1 text-left text-sm hover:bg-accent'
                      onClick={() => {
                        setNewFilterField(f.name);
                        setMenu(null);
                      }}
                    >
                      {f.label}
                      <span className='text-xs text-muted-foreground'>{martLabel(f.aliasPath)}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )
          }
        >
          {creating && (
            <div className='px-3'>
              <FilterEditor
                key={creating.name}
                field={creating}
                instanceLabel={martLabel(creating.aliasPath)}
                mainTitle={main.title}
                isJoined={creating.aliasPath !== ''}
                onSave={(filter) => {
                  props.onUpsertFilter(filter);
                  closeNewFilter();
                }}
                onCancel={closeNewFilter}
              />
            </div>
          )}
          {draft.filters.length === 0 && !creating && <p className='px-3 text-xs text-muted-foreground'>No filters.</p>}
          {draft.filters.map((filter) => {
            const field = index.fields.get(filter.column);
            return (
              <div key={filter.id} className='px-3 py-1'>
                {editingFilter === filter.id && field ? (
                  <FilterEditor
                    field={field}
                    filter={filter}
                    instanceLabel={martLabel(filter.aliasPath)}
                    mainTitle={main.title}
                    isJoined={filter.aliasPath !== ''}
                    onSave={(next) => {
                      props.onUpsertFilter(next);
                      setEditingFilter(null);
                    }}
                    onCancel={() => setEditingFilter(null)}
                  />
                ) : (
                  <div className='flex min-w-0 items-center gap-2'>
                    <button type='button' className='flex min-w-0 flex-1 flex-col text-left' onClick={() => setEditingFilter(filter.id)}>
                      <span className='min-w-0 truncate text-sm'>{fieldLabel(filter.column)}</span>
                      <span className='truncate text-xs text-muted-foreground'>
                        {describeFilter(filter, field && filterKind(field, filter.sliceOnly))}
                      </span>
                    </button>
                    {martOf(filter.aliasPath, 'max-w-[40%] shrink-0')}
                    <PlacementMarker placement={filterPlacement(filter)} kind='filter' mainLabel={main.title} instanceLabel={martLabel(filter.aliasPath)} />
                    <Button variant='ghost' size='icon' className='size-7 shrink-0' aria-label={`Remove filter ${fieldLabel(filter.column)}`} onClick={() => props.onRemoveFilter(filter.id)}>
                      <X className='h-4 w-4' />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </Subsection>
      </Section>

      <Section title='Aggregations'>
        {aggregated.length === 0 && <p className='px-3 text-xs text-muted-foreground'>No aggregations. Set them with Σ on a field in All.</p>}
        {aggregated.map((column) => {
          const field = index.fields.get(column.name);
          const label = field?.label ?? column.name;
          return (
            <div key={column.name} className='flex min-w-0 items-center gap-2 px-3 py-1'>
              {field ? (
                <AggregationPopover
                  field={field}
                  column={column}
                  martLabel={field.aliasPath ? martLabel(field.aliasPath) : undefined}
                  onSetAggregations={props.onSetAggregations}
                  onSetDateTrunc={props.onSetDateTrunc}
                  trigger={
                    <button type='button' aria-label={`Edit aggregation ${label}`} className='flex min-w-0 flex-1 flex-col text-left'>
                      <span className='min-w-0 truncate text-sm'>{label}</span>
                      <span className='truncate text-xs text-primary'>{describeAggregation(column)}</span>
                    </button>
                  }
                />
              ) : (
                <span className='min-w-0 flex-1 truncate text-sm'>{label}</span>
              )}
              {field && martOf(field.aliasPath, 'max-w-[40%] shrink-0')}
              <Button
                variant='ghost'
                size='icon'
                className='size-7 shrink-0'
                aria-label={`Remove aggregation ${label}`}
                onClick={() => (column.dateTrunc ? props.onSetDateTrunc(column.name, undefined) : props.onSetAggregations(column.name, undefined))}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          );
        })}
      </Section>

      <Section title='Columns'>
        {draft.columns.length === 0 && <p className='px-3 text-xs text-muted-foreground'>Tick columns in All.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={names} strategy={verticalListSortingStrategy}>
            <ul className='flex flex-col'>
              {draft.columns.map((column) => {
                const field = index.fields.get(column.name);
                const label = field?.label ?? column.name;
                return (
                  <SortableRow key={column.name} id={column.name}>
                    {!field && <Badge variant='destructive'>Unavailable</Badge>}
                    <span className='flex min-w-0 flex-1 items-center gap-1'>
                      <span className='min-w-0 truncate text-sm' title={label}>
                        {label}
                      </span>
                      {field && <FieldType field={field} />}
                    </span>
                    {field && martOf(field.aliasPath, 'max-w-[40%] shrink-0')}
                    <Button variant='ghost' size='icon' className='size-7 shrink-0' aria-label={`Remove column ${label}`} onClick={() => props.onRemoveColumn(column.name)}>
                      <X className='h-4 w-4' />
                    </Button>
                  </SortableRow>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </Section>
    </div>
  );
}
