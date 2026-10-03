import type { ReactElement } from 'react';
import { Box } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import { cn } from '@owox/ui/lib/utils';
import type { JoinPath } from '../../lib/join-path';

/** Shows the join path of `children` in a light card after a hover or focus of 600 ms, like ODM's join-path tooltip. */
export function JoinPathHoverCard({ path, children }: { path: JoinPath; children: ReactElement }) {
  return (
    <HoverCard openDelay={600} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side='top' align='start' collisionPadding={8} className='p-3 sm:w-115 sm:max-w-115'>
        <JoinPathPreview path={path} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** A vertical stepper: data marts top to bottom, each join's keys and description on the rail between them. */
export function JoinPathPreview({ path }: { path: JoinPath }) {
  return (
    <div className='flex flex-col'>
      <p className='mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>Join path</p>
      <ol aria-label='Join path' className='flex flex-col'>
        {path.nodes.map((node, i) => {
          const hop = i > 0 ? path.hops[i - 1] : undefined;
          return (
            <li key={i} className='flex flex-col items-start'>
              {hop && (
                <div className='grid w-full grid-cols-[22px_1fr] gap-x-3 py-0.5 pl-[15px]'>
                  <div className='relative min-h-11 border-l-2 border-border' aria-hidden='true'>
                    <span className='absolute -bottom-0.5 -left-1.5 border-x-[5px] border-t-[6px] border-x-transparent border-t-muted-foreground/40' />
                  </div>
                  <div className='flex min-w-0 flex-col gap-0.5 py-1.5'>
                    {hop.keys.length > 0 && (
                      <div className='flex flex-wrap gap-1'>
                        {hop.keys.map((key) => (
                          <span key={key} className='rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-snug text-muted-foreground'>
                            {key}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className='text-xs text-muted-foreground'>{hop.description || 'No description.'}</p>
                  </div>
                </div>
              )}
              <span
                data-slot='join-path-node'
                className={cn(
                  'inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background py-1 pr-2.5 pl-1 text-[13px] font-semibold shadow-xs',
                  i === 0 && 'border-primary/20 bg-primary/5',
                )}
              >
                <span className='flex size-[22px] shrink-0 items-center justify-center rounded-md bg-muted' aria-hidden='true'>
                  <Box className='size-3.5' />
                </span>
                <span className='min-w-0 truncate'>{node.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
