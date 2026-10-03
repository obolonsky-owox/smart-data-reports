import { useState, type ReactNode } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { AUTO_DATE_RANGE, usedInstances, type DraftFilter, type ReportDraft } from '../../lib/report-draft';
import type { DateRangeValue } from '../../lib/date-ranges';
import { describeFilter } from '../../lib/filter-operators';
import { dateFields, type SchemaIndex } from '../../lib/schema-index';
import { DateRangeEditor } from './DateRangeEditor';
import { FilterEditor } from './FilterEditor';
import { dateRangePlacement, filterPlacement } from '../../lib/placement';
import { PlacementMarker } from './PlacementMarker';
import { TypeBadge } from './TypeBadge';

export interface SelectedTabProps {
  index: SchemaIndex;
  draft: ReportDraft;
  pendingFilterField: string | null;
  onPendingFilterDone(): void;
  onSetDateRange(column: string, range: DateRangeValue): void;
  onRemoveDateRange(column: string): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
  onMoveColumn(from: number, to: number): void;
  onRemoveColumn(name: string): void;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className='flex min-w-0 flex-col gap-1 border-b border-border py-2 last:border-b-0'>
      <div className='flex items-center justify-between px-3'>
        <h3 className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
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
  const { index, draft, pendingFilterField, onPendingFilterDone } = props;
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
      <Section
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
        {draft.dateRanges.map((range) => (
          <div key={range.column} className='flex items-start gap-2 px-3 py-1'>
            <TypeBadge kind='date' className='mt-2' />
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <div className='flex min-w-0 items-center justify-between gap-2 text-sm'>
                <span className='min-w-0 truncate'>{fieldLabel(range.column)}</span>
                <span className='flex min-w-0 items-center gap-1 text-xs text-muted-foreground'>
                  <span className='truncate'>{martLabel(range.aliasPath)}</span>
                  <PlacementMarker placement={dateRangePlacement(range.aliasPath)} kind='period' mainLabel={main.title} instanceLabel={martLabel(range.aliasPath)} />
                </span>
              </div>
              <DateRangeEditor value={range.range} label={fieldLabel(range.column)} onChange={(value) => props.onSetDateRange(range.column, value)} />
            </div>
            <Button variant='ghost' size='icon' className='size-7 shrink-0' aria-label={`Remove date range ${fieldLabel(range.column)}`} onClick={() => props.onRemoveDateRange(range.column)}>
              <X className='h-4 w-4' />
            </Button>
          </div>
        ))}
      </Section>

      <Section
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
                    <span className='flex min-w-0 justify-between gap-2 text-sm'>
                      <span className='min-w-0 truncate'>{fieldLabel(filter.column)}</span>
                      <span className='max-w-[40%] truncate text-xs text-muted-foreground'>{martLabel(filter.aliasPath)}</span>
                    </span>
                    <span className='truncate text-xs text-muted-foreground'>
                      {describeFilter(filter, index.fields.get(filter.column)?.kind)}
                    </span>
                  </button>
                  <PlacementMarker placement={filterPlacement(filter)} kind='filter' mainLabel={main.title} instanceLabel={martLabel(filter.aliasPath)} />
                  <Button variant='ghost' size='icon' className='size-7 shrink-0' aria-label={`Remove filter ${fieldLabel(filter.column)}`} onClick={() => props.onRemoveFilter(filter.id)}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              )}
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
                    {field ? <TypeBadge kind={field.kind} /> : <Badge variant='destructive'>Unavailable</Badge>}
                    <span className='min-w-0 flex-1 truncate text-sm' title={label}>
                      {label}
                    </span>
                    {field && <span className='max-w-[40%] truncate text-xs text-muted-foreground'>{martLabel(field.aliasPath)}</span>}
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
