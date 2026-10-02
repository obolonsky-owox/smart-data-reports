import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CircleHelp, Filter, Search } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { DataMartSummary } from '../../lib/odm-types';
import { usedInstances, type ReportDraft } from '../../lib/report-draft';
import { chain, chainLabel, type AliasPath, type FieldInfo, type InstanceInfo, type MartGroup, type SchemaIndex } from '../../lib/schema-index';
import { PathDialog } from './PathDialog';
import { TypeBadge } from './TypeBadge';

type PathRequest =
  | { kind: 'add-field'; group: MartGroup; originalName: string }
  | { kind: 'add-instance'; group: MartGroup; instances: InstanceInfo[] }
  | { kind: 'change'; group: MartGroup; from: AliasPath; instances: InstanceInfo[] };

export interface AllFieldsTabProps {
  index: SchemaIndex;
  draft: ReportDraft;
  marts: DataMartSummary[];
  onToggleField(name: string, checked: boolean): void;
  onIncludePath(path: AliasPath): void;
  onChangeInstancePath(from: AliasPath, to: AliasPath): void;
  onAddFilter(name: string): void;
}

export function AllFieldsTab({ index, draft, marts, onToggleField, onIncludePath, onChangeInstancePath, onAddFilter }: AllFieldsTabProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([index.mainDataMartId]));
  const [request, setRequest] = useState<PathRequest | null>(null);

  const used = useMemo(() => new Set(usedInstances(draft)), [draft]);
  const selected = useMemo(() => new Set(draft.columns.map((c) => c.name)), [draft]);
  const main = index.instances.get('')!;
  const needle = query.trim().toLowerCase();
  const matches = (f: FieldInfo) => !needle || f.label.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle);
  const unreachable = marts.filter((m) => !index.groups.some((g) => g.dataMartId === m.id));

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      <div className='relative px-3 py-2'>
        <Search className='pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input type='search' aria-label='Search fields' placeholder='Search' className='h-8 pl-8' value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {index.groups.map((group) => {
        const usedInGroup = group.instances.filter((i) => used.has(i.aliasPath));
        const shown = usedInGroup.length ? usedInGroup : group.instances.slice(0, 1);
        const unused = group.instances.filter((i) => !used.has(i.aliasPath));
        const anyMatch = shown.some((i) => i.fields.some(matches));
        if (needle && !anyMatch) return null;
        const isOpen = !!needle || expanded.has(group.dataMartId) || usedInGroup.length > 0;
        return (
          <section key={group.dataMartId} className='border-b border-border last:border-b-0'>
            <div className='flex items-center gap-1 px-2'>
              <Button variant='ghost' className='h-9 flex-1 justify-start gap-2 px-1 text-sm font-normal' onClick={() => toggleGroup(group.dataMartId)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                {group.title}
              </Button>
              {group.description && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type='button' aria-label={`About ${group.title}`} className='text-muted-foreground'>
                      <CircleHelp className='h-4 w-4' />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className='max-w-xs'>{group.description}</TooltipContent>
                </Tooltip>
              )}
              {usedInGroup.length > 0 && unused.length > 0 && (
                <Button variant='link' size='sm' className='h-7 px-1 text-xs' onClick={() => setRequest({ kind: 'add-instance', group, instances: unused })}>
                  + via another path
                </Button>
              )}
            </div>

            {isOpen &&
              shown.map((instance) => (
                <div key={instance.aliasPath} className='pb-2'>
                  {instance.aliasPath !== '' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type='button'
                          className='ml-9 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground'
                          onClick={() =>
                            group.instances.length > 1 &&
                            setRequest({ kind: 'change', group, from: instance.aliasPath, instances: group.instances.filter((i) => i.aliasPath === instance.aliasPath || !used.has(i.aliasPath)) })
                          }
                        >
                          via {chainLabel(index, instance.aliasPath)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className='max-w-xs'>
                        {chain(index, instance.aliasPath).map((hop) => (
                          <p key={hop.aliasPath}>
                            {hop.label}: {hop.joinDescription || 'No description.'}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {instance.fields.filter(matches).map((field) => {
                    const id = `field-${field.name}`;
                    return (
                      <div key={field.name} className='group flex items-center gap-2 rounded-md px-3 py-1 hover:bg-accent'>
                        <TypeBadge kind={field.kind} />
                        <Checkbox
                          id={id}
                          checked={selected.has(field.name)}
                          onCheckedChange={(checked) => handleToggle(group, instance, field, checked === true)}
                          aria-label={`${field.label} (${usedInGroup.length ? instance.label : group.title})`}
                        />
                        <label htmlFor={id} className='flex-1 truncate text-sm'>
                          {field.label}
                        </label>
                        {field.description && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type='button' aria-label={`About ${field.label}`} className='text-muted-foreground'>
                                <CircleHelp className='h-4 w-4' />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className='max-w-xs'>{field.description}</TooltipContent>
                          </Tooltip>
                        )}
                        {field.kind !== 'date' && (
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                            aria-label={`Filter by ${field.label}`}
                            onClick={() => onAddFilter(field.name)}
                          >
                            <Filter className='h-4 w-4' />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </section>
        );
      })}

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
