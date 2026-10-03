import { Box, ExternalLink, House, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import type { CanvasNode } from '../../lib/canvas-model';
import { useServices } from '../../services';

const ICON_BUTTON = 'nodrag shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground';

interface CanvasNodeCardProps {
  node: Pick<CanvasNode, 'label' | 'dataMartId' | 'kind' | 'description' | 'joinDescription'>;
  selected: boolean;
}

/** The data mart card of the relationship canvas; plain markup, so it renders without React Flow. */
export function CanvasNodeCard({ node, selected }: CanvasNodeCardProps) {
  const { projectId, navigate } = useServices();
  const info = [node.description, node.joinDescription].filter(Boolean);
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
        <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground' aria-hidden='true'>
          <Box className='h-4 w-4' />
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
    </div>
  );
}
