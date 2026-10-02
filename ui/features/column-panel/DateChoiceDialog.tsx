import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import type { DateChoice } from '../../lib/report-draft';
import type { SchemaIndex } from '../../lib/schema-index';

const NONE = '';

/** Closing the dialog keeps the preselected date: by default a report always gets a period. */
export function DateChoiceDialog({ choice, index, onChoose }: { choice: DateChoice; index: SchemaIndex; onChoose(column: string | null): void }) {
  const [selected, setSelected] = useState(choice.candidates[0]?.name ?? NONE);
  const instance = index.instances.get(choice.aliasPath);
  const confirm = () => onChoose(selected === NONE ? null : selected);

  return (
    <Dialog open onOpenChange={(open) => !open && confirm()}>
      <DialogContent className='sm:max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>Which date should limit {instance?.label ?? 'this data mart'}?</DialogTitle>
          <DialogDescription>
            This data mart has several dates. Pick the one the period applies to — it starts at the last 30 days, and you can change or remove it later.
          </DialogDescription>
        </DialogHeader>
        <fieldset className='flex flex-col gap-2 text-sm'>
          <legend className='sr-only'>Date</legend>
          {choice.candidates.map((field) => (
            <label key={field.name} className='flex cursor-pointer items-center gap-2'>
              <input type='radio' name='auto-date' className='accent-primary' checked={selected === field.name} onChange={() => setSelected(field.name)} aria-label={field.label} />
              {field.label}
            </label>
          ))}
          <label className='flex cursor-pointer items-center gap-2 text-muted-foreground'>
            <input type='radio' name='auto-date' className='accent-primary' checked={selected === NONE} onChange={() => setSelected(NONE)} aria-label="Don't add a date" />
            Don't add a date
          </label>
        </fieldset>
        <DialogFooter>
          <Button onClick={confirm}>{selected === NONE ? 'Continue without a date' : 'Add date'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
