import { useId, type ReactNode } from 'react';
import { Info, Link2, Settings } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import type { CanvasDirection } from '../../lib/canvas-model';

/** A part of the data mart card the settings can hide. */
export type CardPart = 'source' | 'fields';

/**
 * The view settings of the Relationships Canvas, ported from ODM's canvas gear. A view
 * preference, not report data: it lives for the editor session.
 */
export interface CanvasSettings {
  direction: CanvasDirection;
  /** Join keys on every edge; otherwise an edge shows its keys on hover. */
  showJoinFields: boolean;
  /** The card parts the member hid; empty means the whole card. */
  hidden: Readonly<Record<CardPart, boolean>>;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  direction: 'horizontal',
  showJoinFields: false,
  hidden: { source: false, fields: false },
};

const CARD_OPTIONS: { part: CardPart; label: string; helper: string }[] = [
  { part: 'source', label: 'Input source', helper: 'View, Table, SQL, Pattern or Connector' },
  { part: 'fields', label: 'Fields', helper: 'Fields of the Data Mart, and how many the report uses' },
];

const DIRECTIONS: { value: CanvasDirection; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

function DirectionIcon({ direction }: { direction: CanvasDirection }) {
  return (
    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      {direction === 'horizontal' ? (
        <>
          <rect x='2' y='9' width='6' height='6' rx='1.5' />
          <rect x='16' y='3' width='6' height='6' rx='1.5' />
          <rect x='16' y='15' width='6' height='6' rx='1.5' />
          <path d='M8 12h4M12 6v12M12 6h4M12 18h4' />
        </>
      ) : (
        <>
          <rect x='9' y='2' width='6' height='6' rx='1.5' />
          <rect x='3' y='16' width='6' height='6' rx='1.5' />
          <rect x='15' y='16' width='6' height='6' rx='1.5' />
          <path d='M12 8v4M6 12h12M6 12v4M18 12v4' />
        </>
      )}
    </svg>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <span className='flex min-h-[22px] items-center text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase'>{children}</span>;
}

interface CanvasSettingsPanelProps {
  settings: CanvasSettings;
  onChange(next: CanvasSettings): void;
}

/** The gear popover's content: layout direction, join keys on edges, and what each card shows. */
export function CanvasSettingsPanel({ settings, onChange }: CanvasSettingsPanelProps) {
  const idPrefix = useId();
  const setHidden = (hidden: CanvasSettings['hidden']) => onChange({ ...settings, hidden });
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <div role='radiogroup' aria-label='Layout direction' className='flex gap-0.5 rounded-lg bg-muted p-0.5'>
          {DIRECTIONS.map((option) => {
            const selected = settings.direction === option.value;
            return (
              <button
                key={option.value}
                type='button'
                role='radio'
                aria-checked={selected}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors',
                  selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onChange({ ...settings, direction: option.value })}
              >
                <DirectionIcon direction={option.value} />
                {option.label}
              </button>
            );
          })}
        </div>
        <span className='grow' />
        <button
          type='button'
          role='switch'
          aria-checked={settings.showJoinFields}
          className={cn(
            'inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors',
            settings.showJoinFields ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted/50',
          )}
          onClick={() => onChange({ ...settings, showJoinFields: !settings.showJoinFields })}
        >
          <Link2 className='h-[15px] w-[15px]' aria-hidden='true' />
          Show join fields
        </button>
      </div>

      <div className='h-px bg-border' />

      <div role='group' aria-label='Card content' className='flex min-w-0 flex-col gap-0.5'>
        <SectionHeading>Card content</SectionHeading>
        {/* A checked box means the part is visible; the stored state is the hidden set. */}
        {CARD_OPTIONS.map(({ part, label, helper }) => {
          const id = `${idPrefix}-${part}`;
          return (
            <div key={part} className='group/row -mx-1.5 flex min-h-[34px] items-center rounded-md pr-0.5 pl-1.5 transition-colors hover:bg-muted/60'>
              <label htmlFor={id} className='flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch text-[13.5px] text-foreground'>
                <Checkbox id={id} checked={!settings.hidden[part]} onCheckedChange={() => setHidden({ ...settings.hidden, [part]: !settings.hidden[part] })} />
                <span className='min-w-0 truncate'>{label}</span>
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type='button'
                    aria-label={`About ${label}`}
                    className='inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity outline-none group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50'
                  >
                    <Info className='size-3.5' aria-hidden='true' />
                  </button>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  {helper}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>

      <div className='flex gap-2 border-t pt-2.5'>
        <button type='button' className='cursor-pointer rounded-md px-2 py-1.5 text-[13px] text-primary hover:bg-muted' onClick={() => setHidden({ source: false, fields: false })}>
          Show all
        </button>
        <button type='button' className='cursor-pointer rounded-md px-2 py-1.5 text-[13px] text-primary hover:bg-muted' onClick={() => setHidden({ source: true, fields: true })}>
          Title only
        </button>
      </div>
    </div>
  );
}

/** The gear button and its popover, placed like ODM's: beside the zoom controls, opening to the left. */
export function CanvasSettingsPopover(props: CanvasSettingsPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='icon' className='h-12 w-12' aria-label='Canvas settings'>
          <Settings className='h-6 w-6' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='left'
        collisionPadding={8}
        className='max-h-(--radix-popover-content-available-height) w-[400px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[14px] p-4'
      >
        <CanvasSettingsPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}
