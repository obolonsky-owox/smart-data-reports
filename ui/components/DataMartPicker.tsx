import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from '@owox/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { cn } from '@owox/ui/lib/utils';
import type { DataMartSummary } from '../lib/odm-types';

export interface DataMartPickerProps {
  /** Accessible name of the trigger and its list. */
  label: string;
  marts: Pick<DataMartSummary, 'id' | 'title'>[];
  value: string;
  /** `trigger` is the picker's button, where the focus returns once the list has closed. */
  onChange(dataMartId: string, trigger: HTMLButtonElement | null): void;
  className?: string;
}

/** A select-only combobox with a search box: the trigger shows the current data mart, the popover filters the list. */
export function DataMartPicker({ label, marts, value, onChange, className }: DataMartPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const needle = query.trim().toLowerCase();
  const filtered = needle ? marts.filter((m) => m.title.toLowerCase().includes(needle)) : marts;
  const activeIndex = Math.min(active, filtered.length - 1);
  const optionId = (i: number) => `${listId}-option-${i}`;
  const current = marts.find((m) => m.id === value);

  function changeOpen(next: boolean) {
    if (next) {
      setQuery('');
      setActive(Math.max(0, marts.findIndex((m) => m.id === value)));
    }
    setOpen(next);
  }

  function pick(dataMartId: string) {
    setOpen(false);
    if (dataMartId !== value) onChange(dataMartId, triggerRef.current);
  }

  // Runs whenever another option becomes active, including when the portaled list first mounts.
  const scrollIntoView = useCallback((option: HTMLDivElement | null) => option?.scrollIntoView({ block: 'nearest' }), []);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.min(Math.max(activeIndex + step, 0), filtered.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const mart = filtered[activeIndex];
      if (mart) pick(mart.id);
    }
  }

  return (
    // Modal, so a Sheet's scroll lock doesn't swallow wheel scrolling of the portaled list.
    <Popover modal open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type='button'
          role='combobox'
          aria-label={label}
          aria-haspopup='listbox'
          aria-expanded={open}
          aria-controls={listId}
          disabled={marts.length === 0}
          onKeyDown={(event) => {
            if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              changeOpen(true);
            }
          }}
          className={cn(
            'flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2 text-left text-sm shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            className,
          )}
        >
          <span className={cn('min-w-0 truncate', !current && 'text-muted-foreground')}>{current?.title ?? 'Choose a data mart'}</span>
          <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-(--radix-popover-trigger-width) min-w-56 p-0'
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className='relative border-b border-border p-1'>
          <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            ref={inputRef}
            type='text'
            aria-label='Search data marts'
            aria-controls={listId}
            aria-autocomplete='list'
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            placeholder='Search'
            autoComplete='off'
            className='h-8 border-0 pl-8 shadow-none focus-visible:ring-0 dark:bg-transparent'
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
        </div>
        <div role='listbox' id={listId} aria-label={label} className='max-h-64 overflow-y-auto p-1'>
          {filtered.map((mart, i) => (
            <div
              key={mart.id}
              id={optionId(i)}
              ref={i === activeIndex ? scrollIntoView : undefined}
              role='option'
              aria-selected={mart.id === value}
              data-highlighted={i === activeIndex ? '' : undefined}
              title={mart.title}
              className='relative flex w-full min-w-0 cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'
              onMouseMove={() => i !== activeIndex && setActive(i)}
              // Keeps focus in the search box until the pick closes the popover.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(mart.id)}
            >
              <span className='truncate'>{mart.title}</span>
              {mart.id === value && <Check className='absolute right-2 h-4 w-4' />}
            </div>
          ))}
          {filtered.length === 0 && <p className='py-2 text-center text-sm text-muted-foreground'>No data marts found.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
