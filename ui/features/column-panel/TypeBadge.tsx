import { cn } from '@owox/ui/lib/utils';
import type { FieldKind } from '../../lib/schema-index';

const LABEL: Record<FieldKind, string> = { text: 'ABC', number: '123', date: 'DD', boolean: 'BOOL', other: '{ }' };

export function TypeBadge({ kind, className }: { kind: FieldKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('w-9 shrink-0 font-mono text-[10px] font-medium', kind === 'number' ? 'text-primary' : 'text-success', className)}
    >
      {LABEL[kind]}
    </span>
  );
}
