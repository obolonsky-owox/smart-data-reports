import { cn } from '@owox/ui/lib/utils';
import { joinPath } from '../../lib/join-path';
import type { RelationshipGraph } from '../../lib/odm-types';
import type { AliasPath, SchemaIndex } from '../../lib/schema-index';
import { JoinPathHoverCard } from './JoinPathPreview';

/** The data mart a field comes from; a joined one shows its join path on hover, like the groups in All. */
export function MartLabel({ index, graph, aliasPath, className }: { index: SchemaIndex; graph: RelationshipGraph; aliasPath: AliasPath; className?: string }) {
  const instance = index.instances.get(aliasPath);
  const base = cn('min-w-0 truncate text-xs text-muted-foreground', className);
  if (!instance || aliasPath === '') return <span className={base}>{instance?.label ?? 'Unavailable'}</span>;
  return (
    <JoinPathHoverCard path={joinPath(index, graph, aliasPath)}>
      <span
        tabIndex={0}
        className={cn(base, 'cursor-default rounded-sm underline decoration-dashed underline-offset-2 hover:text-foreground')}
      >
        {instance.label}
      </span>
    </JoinPathHoverCard>
  );
}
