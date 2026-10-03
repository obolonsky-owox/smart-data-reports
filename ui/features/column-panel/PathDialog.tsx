import { useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import { cn } from '@owox/ui/lib/utils';
import { chain, type AliasPath, type InstanceInfo, type SchemaIndex } from '../../lib/schema-index';

interface PathDialogProps {
  title: string;
  description?: string;
  index: SchemaIndex;
  mainTitle: string;
  instances: InstanceInfo[];
  initial?: AliasPath;
  confirmLabel?: string;
  onChoose(path: AliasPath): void;
  onCancel(): void;
}

/** Mount it only while a choice is pending; it starts from `initial` every time. */
export function PathDialog({ title, description, index, mainTitle, instances, initial, confirmLabel = 'Use this path', onChoose, onCancel }: PathDialogProps) {
  const [selected, setSelected] = useState<AliasPath | undefined>(initial ?? instances[0]?.aliasPath);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <fieldset className='flex flex-col gap-2'>
          <legend className='sr-only'>Join path</legend>
          {instances.map((instance) => {
            const hops = chain(index, instance.aliasPath);
            const pathLabel = [mainTitle, ...hops.map((h) => h.label)].join(' → ');
            return (
              <label
                key={instance.aliasPath}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-md border border-border p-3',
                  selected === instance.aliasPath && 'border-primary bg-accent',
                )}
              >
                <input
                  type='radio'
                  name='join-path'
                  className='mt-1 accent-primary'
                  checked={selected === instance.aliasPath}
                  onChange={() => setSelected(instance.aliasPath)}
                  aria-label={pathLabel}
                />
                <span className='flex flex-col gap-1'>
                  <span className='text-sm font-medium'>{pathLabel}</span>
                  {hops
                    .filter((h) => h.joinDescription)
                    .map((h) => (
                      <span key={h.aliasPath} className='text-xs text-muted-foreground'>
                        {h.label}: {h.joinDescription}
                      </span>
                    ))}
                </span>
              </label>
            );
          })}
        </fieldset>
        <DialogFooter>
          <Button variant='outline' onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={selected === undefined} onClick={() => selected !== undefined && onChoose(selected)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
