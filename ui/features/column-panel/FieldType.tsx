import type { FieldInfo } from '../../lib/schema-index';

/** `(TYPE)` as the field's Output Schema has it; a joined field that ODM returns as another type says so on hover. */
export function FieldType({ field }: { field: Pick<FieldInfo, 'type' | 'joinedType'> }) {
  return (
    <span
      className='shrink-0 text-xs text-muted-foreground'
      title={field.joinedType ? `After the join, ODM returns this field as ${field.joinedType}` : undefined}
    >
      ({field.type})
    </span>
  );
}
