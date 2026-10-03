import { useId } from 'react';
import { Box } from 'lucide-react';
import type { JoinPath } from '../../lib/join-path';

/** A mini canvas of a join path: data mart cards left to right, join keys over the arrows. */
export function JoinPathPreview({ path }: { path: JoinPath }) {
  // An SVG reference must be a plain fragment id.
  const markerId = `join-arrow-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <div className='flex flex-col gap-2 py-1'>
      <svg width='0' height='0' className='absolute' aria-hidden='true'>
        <defs>
          <marker id={markerId} markerWidth='9' markerHeight='9' refX='7' refY='3' orient='auto' markerUnits='strokeWidth'>
            <path d='M0,0 L7,3 L0,6 z' fill='var(--muted-foreground)' />
          </marker>
        </defs>
      </svg>
      <ol aria-label='Join path' className='flex flex-wrap items-center gap-y-2'>
        {path.nodes.map((node, i) => {
          const hop = i > 0 ? path.hops[i - 1] : undefined;
          return (
            <li key={i} className='flex items-center'>
              {hop && (
                <span className='flex min-w-14 flex-col items-stretch gap-0.5 px-1'>
                  {hop.keys.map((key) => (
                    <span key={key} className='text-center font-mono text-[10px] leading-tight'>
                      {key}
                    </span>
                  ))}
                  <svg className='h-2 w-full overflow-visible' aria-hidden='true'>
                    <line x1='0' y1='4' x2='100%' y2='4' stroke='var(--muted-foreground)' strokeWidth='1.5' markerEnd={`url(#${markerId})`} />
                  </svg>
                </span>
              )}
              <span data-slot='join-path-node' className='flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm'>
                <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted' aria-hidden='true'>
                  <Box className='h-3 w-3' />
                </span>
                <span className='max-w-32 truncate font-medium'>{node.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {path.hops.length > 0 && (
        <div className='flex flex-col gap-0.5 border-t border-border/50 pt-1.5'>
          {path.hops.map((hop, i) => (
            <p key={i}>
              {path.nodes[i + 1]!.label}: {hop.description || 'No description.'}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
