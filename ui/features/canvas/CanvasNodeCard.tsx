import { Asterisk, Code, ExternalLink, Grip, House, Info, Plug, Table, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import type { CanvasNode } from '../../lib/canvas-model';
import type { DataMartAppearance } from '../../lib/odm-types';
import { useServices } from '../../services';
import { DataMartIconGlyph } from '../../components/data-mart-icon/DataMartIconGlyph';
import type { CardPart } from './CanvasSettingsPopover';

/** ODM's names and glyphs for what defines a data mart. */
const DEFINITION_TYPES: Record<string, { label: string; icon: LucideIcon }> = {
  SQL: { label: 'SQL', icon: Code },
  TABLE: { label: 'Table', icon: Table },
  VIEW: { label: 'View', icon: Grip },
  TABLE_PATTERN: { label: 'Pattern', icon: Asterisk },
  CONNECTOR: { label: 'Connector', icon: Plug },
};

/** The input-source pill of ODM's canvas cards; nothing while the type is unknown. */
function DefinitionBadge({ type }: { type: string | null }) {
  const info = type ? DEFINITION_TYPES[type] : undefined;
  if (!info) return null;
  const Icon = info.icon;
  return (
    <span className='inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[9px] font-semibold tracking-wide text-muted-foreground uppercase'>
      <Icon className='h-2.5 w-2.5' aria-hidden='true' />
      {info.label}
    </span>
  );
}

const plural = (n: number) => `${n} field${n === 1 ? '' : 's'}`;

const ICON_BUTTON = 'nodrag shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground';

interface CanvasNodeCardProps {
  node: Pick<CanvasNode, 'label' | 'dataMartId' | 'kind' | 'description' | 'joinDescription'> &
    Partial<Pick<CanvasNode, 'fieldCount' | 'usedFieldCount'>>;
  /** The data mart's icon and input source; absent until the data mart list names them. */
  appearance?: DataMartAppearance;
  /** The card parts the canvas settings hide; absent shows the title only. */
  hidden?: Readonly<Record<CardPart, boolean>>;
  selected: boolean;
}

/** The data mart card of the relationship canvas; plain markup, so it renders without React Flow. */
export function CanvasNodeCard({ node, appearance, hidden = { source: true, fields: true }, selected }: CanvasNodeCardProps) {
  const { projectId, navigate } = useServices();
  const info = [node.description, node.joinDescription].filter(Boolean);
  const withMeta = !hidden.source || !hidden.fields;
  const used = node.usedFieldCount ?? 0;
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border bg-background shadow-sm',
        node.kind === 'main' && 'bg-primary/5',
        node.kind === 'transit' && 'border-dashed opacity-60',
        selected && 'border-primary ring-1 ring-primary',
      )}
      data-kind={node.kind}
    >
      <div className='flex items-center gap-2 p-3'>
        <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground' aria-hidden='true' data-testid='dataMartIcon'>
          <DataMartIconGlyph icon={appearance?.icon} className='h-4 w-4' />
        </span>
        {node.kind === 'main' && <House className='h-3.5 w-3.5 shrink-0 text-primary' aria-label='Main data mart' />}
        <span className='min-w-0 flex-1 truncate text-sm font-semibold text-foreground' title={node.label}>
          {node.label}
        </span>
        {info.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type='button' className={ICON_BUTTON} aria-label={`About ${node.label}`} onClick={(e) => e.stopPropagation()}>
                <Info className='h-3.5 w-3.5' aria-hidden='true' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-xs whitespace-pre-wrap'>
              <div className='max-h-64 overflow-y-auto'>{info.join('\n\n')}</div>
            </TooltipContent>
          </Tooltip>
        )}
        <button
          type='button'
          className={ICON_BUTTON}
          aria-label={`Open ${node.label}`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/ui/${projectId}/data-marts/${node.dataMartId}`);
          }}
        >
          <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>
      {withMeta && (
        <div className='-mt-1 flex h-6 min-w-0 items-start gap-2 px-3 pl-12'>
          {!hidden.source && <DefinitionBadge type={appearance?.definitionType ?? null} />}
          {!hidden.fields && node.fieldCount !== undefined && (
            <span className='ml-auto shrink-0 text-[11px] text-muted-foreground'>
              {used > 0 ? `${used} of ${plural(node.fieldCount)}` : plural(node.fieldCount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
