import { Filter, Layers } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { Placement } from '../../lib/placement';

export interface PlacementMarkerProps {
  placement: Placement;
  kind: 'period' | 'filter';
  mainLabel: string;
  instanceLabel: string;
}

function explain({ placement, kind, mainLabel, instanceLabel }: PlacementMarkerProps): string {
  if (placement === 'filter') {
    return kind === 'period'
      ? `Filter — narrows the whole report. ${mainLabel} rows outside this period are left out.`
      : `Filter — narrows the whole report. ${mainLabel} rows that don't match are left out.`;
  }
  const tail =
    kind === 'period'
      ? `All ${mainLabel} rows stay; their ${instanceLabel} values come from this period only.`
      : `All ${mainLabel} rows stay; only matching ${instanceLabel} rows are joined.`;
  return `Slice — narrows only ${instanceLabel} before the join. ${tail}`;
}

export function PlacementMarker(props: PlacementMarkerProps) {
  const Icon = props.placement === 'filter' ? Filter : Layers;
  const label = props.placement === 'filter' ? 'Filter' : 'Slice';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type='button' aria-label={label} className='inline-flex shrink-0 items-center text-muted-foreground'>
          <Icon className='h-4 w-4' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        {explain(props)}
      </TooltipContent>
    </Tooltip>
  );
}
