import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react';
import { Badge } from '@owox/ui/components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@owox/ui/components/collapsible';
import { Input } from '@owox/ui/components/input';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { joinPath, variantLabels } from '../../lib/join-path';
import type { AggregateFunction, DataMartSummary, DateTruncUnit, RelationshipGraph } from '../../lib/odm-types';
import { activeVariant, hasSelections, type DraftFilter, type ReportDraft } from '../../lib/report-draft';
import { chainLabel, type AliasPath, type FieldInfo, type MartGroup, type SchemaIndex } from '../../lib/schema-index';
import { FieldRow } from './FieldRow';
import { JoinPathHoverCard } from './JoinPathPreview';

export interface AllFieldsTabProps {
  index: SchemaIndex;
  /** Supplies the join keys shown in the join-path preview. */
  graph: RelationshipGraph;
  draft: ReportDraft;
  /** Reportable data marts of the main data mart's storage; the rest are never reachable from it. */
  marts: DataMartSummary[];
  onToggleField(name: string, checked: boolean): void;
  /** Moves the selections of one join path to another; the editor confirms anything that would be lost. */
  onChangeInstancePath(from: AliasPath, to: AliasPath): void;
  onSetAggregations(column: string, fns: AggregateFunction[] | undefined): void;
  onSetDateTrunc(column: string, unit: DateTruncUnit | undefined): void;
  onUpsertFilter(filter: DraftFilter): void;
  onRemoveFilter(id: string): void;
}

export function AllFieldsTab(props: AllFieldsTabProps) {
  const { index, draft, marts } = props;
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);

  const selected = useMemo(() => new Set(draft.columns.map((c) => c.name)), [draft]);
  const main = index.instances.get('')!;
  const needle = query.trim().toLowerCase();
  const matches = (f: FieldInfo) => !needle || f.label.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle);
  const visible = (f: FieldInfo) => matches(f) && (!selectedOnly || selected.has(f.name));
  const unreachable = marts.filter((m) => !index.groups.some((g) => g.dataMartId === m.id));

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
        {index.groups.map((group) => (
          <AliasGroupSection
            // A new main data mart starts every group from its initial state again.
            key={`${index.mainDataMartId}/${group.key}`}
            {...props}
            group={group}
            mainTitle={main.title}
            selected={selected}
            visible={visible}
            filtering={!!needle || selectedOnly}
            searching={!!needle}
          />
        ))}
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
    </div>
  );
}

interface AliasGroupSectionProps extends AllFieldsTabProps {
  group: MartGroup;
  mainTitle: string;
  selected: ReadonlySet<string>;
  visible(field: FieldInfo): boolean;
  /** A search or "Show selected only" hides groups without a matching field. */
  filtering: boolean;
  /** A search opens every group it reaches; the user may still collapse one afterwards. */
  searching: boolean;
}

/** One Output Alias: its join paths to choose from, then the fields of the active one. */
function AliasGroupSection(props: AliasGroupSectionProps) {
  const { index, graph, draft, group, mainTitle, selected, visible, filtering, searching } = props;
  const paths = useMemo(() => new Set(group.instances.map((i) => i.aliasPath)), [group]);
  const selectedCount = draft.columns.filter((c) => paths.has(c.aliasPath)).length;
  const isMain = group.key === '';
  const [open, setOpen] = useState(isMain || selectedCount > 0 || searching);
  const [wasSearching, setWasSearching] = useState(searching);
  if (searching !== wasSearching) {
    setWasSearching(searching);
    if (searching) setOpen(true);
  }
  // A path picked while nothing is selected lives here; selections then pin it in the draft.
  const [chosen, setChosen] = useState<AliasPath>();
  const radioName = useId();
  const countId = useId();

  const active = activeVariant(group, draft, chosen);
  const fields = active.fields.filter(visible);
  // Hiding by returning null keeps the local path choice while a search runs.
  if (filtering && fields.length === 0) return null;

  function choose(path: AliasPath) {
    if (path === active.aliasPath) return;
    if (hasSelections(draft, active.aliasPath)) {
      // The draft decides from here on: the moved selections, or the included path once they are removed.
      setChosen(undefined);
      props.onChangeInstancePath(active.aliasPath, path);
    } else {
      setChosen(path);
    }
  }

  const Chevron = open ? ChevronDown : ChevronRight;
  const aliased = group.label !== group.title;
  const heading = aliased ? `${group.label} · ${group.title}` : group.label;
  const labels = group.instances.length > 1 ? variantLabels(index, graph, group.instances.map((i) => i.aliasPath)) : [];

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section>
        <div className='group/data-mart flex w-full items-center gap-1.5 rounded bg-secondary/50 px-1 py-1 transition-colors hover:bg-secondary/80 dark:bg-muted/50 dark:hover:bg-muted/80'>
          <CollapsibleTrigger
            data-slot='alias-group-trigger'
            className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left'
            aria-label={heading}
            aria-describedby={selectedCount > 0 ? countId : undefined}
          >
            <Chevron className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0 truncate text-xs' title={heading}>
              <span className='font-semibold'>{group.label}</span>
              {aliased && <span className='text-muted-foreground'> · {group.title}</span>}
            </span>
            {selectedCount > 0 && (
              <Badge id={countId} variant='secondary' className='h-4 px-1.5 text-[11px] tabular-nums'>
                {selectedCount}
                <span className='sr-only'> selected</span>
              </Badge>
            )}
          </CollapsibleTrigger>
          {group.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  aria-label={`About ${group.label}`}
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
        <CollapsibleContent>
          <div className='py-1'>
            {group.instances.length > 1 ? (
              <fieldset className='mb-1 flex flex-col gap-0.5 px-1 pb-1'>
                <legend className='py-1 text-xs text-muted-foreground'>{group.instances.length} join paths</legend>
                {group.instances.map((instance, i) => (
                  <JoinPathHoverCard key={instance.aliasPath} path={joinPath(index, graph, instance.aliasPath)}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        instance === active && 'text-foreground',
                      )}
                    >
                      <input
                        type='radio'
                        name={radioName}
                        className='accent-primary'
                        checked={instance === active}
                        onChange={() => choose(instance.aliasPath)}
                      />
                      <span className='min-w-0 truncate'>{labels[i]}</span>
                    </label>
                  </JoinPathHoverCard>
                ))}
              </fieldset>
            ) : (
              !isMain && (
                <JoinPathHoverCard path={joinPath(index, graph, active.aliasPath)}>
                  <span
                    tabIndex={0}
                    className='mx-1 cursor-default rounded-sm text-xs text-muted-foreground underline decoration-dashed underline-offset-2 hover:text-foreground'
                  >
                    via {chainLabel(index, active.aliasPath)}
                  </span>
                </JoinPathHoverCard>
              )
            )}
            {fields.map((field) => (
              <FieldRow
                key={field.name}
                field={field}
                checkboxLabel={`${field.label} (${group.label})`}
                checked={selected.has(field.name)}
                column={draft.columns.find((c) => c.name === field.name)}
                filters={draft.filters.filter((f) => f.column === field.name)}
                martLabel={isMain ? undefined : active.label}
                mainTitle={mainTitle}
                onToggle={(checked) => props.onToggleField(field.name, checked)}
                onSetAggregations={props.onSetAggregations}
                onSetDateTrunc={props.onSetDateTrunc}
                onUpsertFilter={props.onUpsertFilter}
                onRemoveFilter={props.onRemoveFilter}
              />
            ))}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
