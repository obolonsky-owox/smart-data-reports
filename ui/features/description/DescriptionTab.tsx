import { Loader2, Save } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { cn } from '@owox/ui/lib/utils';
import { DESCRIPTION_LIMIT } from '../../lib/report-store';

interface DescriptionTabProps {
  value: string;
  onChange(value: string): void;
  /** Saves the whole report, the description with it, without running the query. */
  onSave(): void;
  /** The report has changes to save. */
  dirty: boolean;
  saving: boolean;
}

export function DescriptionTab({ value, onChange, onSave, dirty, saving }: DescriptionTabProps) {
  return (
    <div className='flex flex-col gap-2 pt-4'>
      <textarea
        aria-label='Report description'
        placeholder='Notes on this report: what it answers, how to read it, what to check.'
        maxLength={DESCRIPTION_LIMIT}
        rows={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none',
          'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      />
      <div className='flex items-center justify-between gap-2'>
        <p className='text-xs text-muted-foreground'>
          {value.length} / {DESCRIPTION_LIMIT} · Everyone who can open this report sees it.
        </p>
        <Button size='sm' disabled={!dirty || saving} onClick={onSave}>
          {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Save className='h-4 w-4' />}
          Save
        </Button>
      </div>
    </div>
  );
}
