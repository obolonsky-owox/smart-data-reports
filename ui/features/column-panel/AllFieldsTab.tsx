import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@owox/ui/components/collapsible';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { joinPath } from '../../lib/join-path';
import type { AggregateFunction, DataMartSummary, DateTruncUnit, RelationshipGraph } from '../../lib/odm-types';
import { usedInstances, type DraftFilter, type ReportDraft } from '../../lib/report-draft';
import { chainLabel, type AliasPath, type FieldInfo, type InstanceInfo, type MartGroup, type SchemaIndex } from '../../lib/schema-index';
import { FieldRow } from './FieldRow';
import { JoinPathPreview } from './JoinPathPreview';
import { PathDialog } from './PathDialog';

type PathRequest =
  | { kind: 'add-field'; group: MartGroup; originalName: string }
  | { kind: 'add-instance'; group: MartGroup; instances: InstanceInfo[] }
  | { kind: 'change'; group: MartGroup; from: AliasPath; instances: InstanceInfo[] };

export interface AllFieldsTabProps {
  index: SchemaIndex;
  /** Supplies the join keys shown in the join-path preview. */
  graph: RelationshipGraph;
  draft: ReportDraft;
  marts: DataMartSummary[];
  onToggleField(name: string, checked: boolean): void;
  onIncludePath(path: AliasPath): void;
  onChangeInstancePath(from: AliasPath, to: AliasPath): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
}

export function AllFieldsTab(props: AllFieldsTabProps) {
  const { index, draft, marts, onToggleField, onIncludePath, onChangeInstancePath } = props;
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [request, setRequest] = useState<PathRequest | null>(null);

  const used = useMemo(() => new Set(usedInstances(draft)), [draft]);
  const selected = useMemo(() => new Set(draft.columns.map((c) => c.name)), [draft]);
  const main = index.instances.get('')!;
  const needle = query.trim().toLowerCase();
  const matches = (f: FieldInfo) => !needle || f.label.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle);
  const visible = (f: FieldInfo) => matches(f) && (!selectedOnly || selected.has(f.name));
  const unreachable = marts.filter((m) => !index.groups.some((g) => g.dataMartId === m.id));
  const selectedPerMart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of draft.columns) {
      const id = index.instances.get(c.aliasPath)?.dataMartId;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [draft, index]);

  function handleToggle(group: MartGroup, instance: InstanceInfo, field: FieldInfo, checked: boolean) {
    if (!checked || used.has(instance.aliasPath) || group.instances.length === 1) {
      onToggleField(field.name, checked);
      return;
    }
    setRequest({ kind: 'add-field', group, originalName: field.originalName });
  }

  function choosePath(path: AliasPath) {
    if (!request) return;
    if (request.kind === 'add-field') {
      const field = index.instances.get(path)?.fields.find((f) => f.originalName === request.originalName);
      if (field) onToggleField(field.name, true);
    } else if (request.kind === 'add-instance') {
      onIncludePath(path);
    } else {
      onChangeInstancePath(request.from, path);
    }
    setRequest(null);
  }

  const dialogInstances = request
    ? request.kind === 'add-field'
      ? request.group.instances
      : request.instances
    : [];

  return (
    <div className='flex flex-col'>
      <div className='flex flex-col gap-1 px-3 py-2'>
        <div className='relative'>
          <Search className='pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input type='search' aria-label='Search fields' placeholder='Search' className='h-8 pl-8' value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className='flex cursor-pointer items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground'>
          <Switch className='scale-75' checked={selectedOnly} onCheckedChange={setSelectedOnly} />
          Show selected only
        </label>
      </div>

      {selectedOnly && selected.size === 0 && <p className='px-3 py-3 text-xs text-muted-foreground'>No fields selected.</p>}

      <div className='flex flex-col gap-1 px-2'>
        {index.groups.map((group) => {
          const usedInGroup = group.instances.filter((i) => used.has(i.aliasPath));
          const shown = usedInGroup.length ? usedInGroup : group.instances.slice(0, 1);
          const unused = group.instances.filter((i) => !used.has(i.aliasPath));
          if ((needle || selectedOnly) && !shown.some((i) => i.fields.some(visible))) return null;
          const selectedCount = selectedPerMart.get(group.dataMartId) ?? 0;
          return (
            <MartGroupSection
              // A new main data mart starts every group from its initial state again.
              key={`${index.mainDataMartId}/${group.dataMartId}`}
              group={group}
              selectedCount={selectedCount}
              initiallyOpen={group.dataMartId === index.mainDataMartId || selectedCount > 0}
              searching={!!needle}
              onAddInstance={usedInGroup.length > 0 && unused.length > 0 ? () => setRequest({ kind: 'add-instance', group, instances: unused }) : undefined}
            >
              {shown
                .filter((instance) => !selectedOnly || instance.fields.some(visible))
                .map((instance) => (
                  <div key={instance.aliasPath} className='py-1'>
                    {instance.aliasPath !== '' && (
                      <Tooltip delayDuration={600}>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            className='rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground'
                            onClick={() =>
                              group.instances.length > 1 &&
                              setRequest({ kind: 'change', group, from: instance.aliasPath, instances: group.instances.filter((i) => i.aliasPath === instance.aliasPath || !used.has(i.aliasPath)) })
                            }
                          >
                            via {chainLabel(index, instance.aliasPath)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side='top' align='start' collisionPadding={8} className='max-w-md'>
                          <JoinPathPreview path={joinPath(index, props.graph, instance.aliasPath)} />
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {instance.fields.filter(visible).map((field) => (
                      <FieldRow
                        key={field.name}
                        field={field}
                        checkboxLabel={`${field.label} (${usedInGroup.length ? instance.label : group.title})`}
                        checked={selected.has(field.name)}
                        column={draft.columns.find((c) => c.name === field.name)}
                        filters={draft.filters.filter((f) => f.column === field.name)}
                        martLabel={instance.aliasPath ? instance.label : undefined}
                        mainTitle={main.title}
                        onToggle={(checked) => handleToggle(group, instance, field, checked)}
                        onSetAggregations={props.onSetAggregations}
                        onSetDateTrunc={props.onSetDateTrunc}
                        onUpsertFilter={props.onUpsertFilter}
                        onRemoveFilter={props.onRemoveFilter}
                      />
                    ))}
                  </div>
                ))}
            </MartGroupSection>
          );
        })}
      </div>

      {unreachable.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p tabIndex={0} className='px-3 py-3 text-xs text-muted-foreground'>
              {unreachable.length} data mart{unreachable.length === 1 ? '' : 's'} can't be reached from {main.title}
            </p>
          </TooltipTrigger>
          <TooltipContent className='max-w-xs'>
            Relationships run one way. No relationship path leads from {main.title} to: {unreachable.map((m) => m.title).join(', ')}.
          </TooltipContent>
        </Tooltip>
      )}

      {request && (
        <PathDialog
          title={request.kind === 'change' ? `Change how ${request.group.title} is joined` : `How should ${request.group.title} be joined?`}
          description={`${request.group.title} can be reached from ${main.title} in more than one way. Each path can give different rows.`}
          index={index}
          mainTitle={main.title}
          instances={dialogInstances}
          initial={request.kind === 'change' ? request.from : undefined}
          onChoose={choosePath}
          onCancel={() => setRequest(null)}
        />
      )}
    </div>
  );
}

interface MartGroupSectionProps {
  group: MartGroup;
  selectedCount: number;
  initiallyOpen: boolean;
  /** A search opens every group it reaches; the user may still collapse one afterwards. */
  searching: boolean;
  onAddInstance?: () => void;
  children: ReactNode;
}

function MartGroupSection({ group, selectedCount, initiallyOpen, searching, onAddInstance, children }: MartGroupSectionProps) {
  const [open, setOpen] = useState(initiallyOpen || searching);
  const [wasSearching, setWasSearching] = useState(searching);
  if (searching !== wasSearching) {
    setWasSearching(searching);
    if (searching) setOpen(true);
  }
  const countId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section>
        <div className='group/data-mart flex w-full items-center gap-1.5 rounded bg-secondary/50 px-1 py-1 transition-colors hover:bg-secondary/80 dark:bg-muted/50 dark:hover:bg-muted/80'>
          <CollapsibleTrigger
            className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left'
            aria-label={group.title}
            aria-describedby={selectedCount > 0 ? countId : undefined}
          >
            <Chevron className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0 truncate text-xs font-semibold' title={group.title}>
              {group.title}
            </span>
            {selectedCount > 0 && (
              <Badge id={countId} variant='secondary' className='h-4 px-1.5 text-[11px] tabular-nums'>
                {selectedCount}
                <span className='sr-only'> selected</span>
              </Badge>
            )}
          </CollapsibleTrigger>
          {onAddInstance && (
            <Button variant='link' size='sm' className='h-6 px-1 text-xs' onClick={onAddInstance}>
              + via another path
            </Button>
          )}
          {group.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={`About ${group.title}`}
                  className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/data-mart:opacity-100 hover:text-foreground focus-visible:opacity-100'
                >
                  <Info className='size-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent side='top' className='max-w-xs whitespace-pre-wrap'>
                {group.description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <CollapsibleContent>{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
