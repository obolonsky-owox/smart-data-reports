import type { SelectHTMLAttributes } from 'react';
import { cn } from '@owox/ui/lib/utils';

/** The design system's native Select: a plain <select> on the Input tokens. */
export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
