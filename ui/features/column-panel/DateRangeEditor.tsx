import { Input } from '@owox/ui/components/input';
import { NativeSelect } from '../../components/NativeSelect';
import { DATE_RANGE_PRESETS, type DateRangePreset, type DateRangeValue } from '../../lib/date-ranges';

const today = () => new Date().toISOString().slice(0, 10);

export function DateRangeEditor({ value, onChange, label }: { value: DateRangeValue; onChange(value: DateRangeValue): void; label: string }) {
  const selected = value.kind === 'preset' ? value.preset : value.kind;
  return (
    <div className='flex flex-col gap-1'>
      <NativeSelect
        aria-label={`Period for ${label}`}
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'all-time') onChange({ kind: 'all-time' });
          else if (next === 'custom') onChange({ kind: 'custom', from: today(), to: today() });
          else onChange({ kind: 'preset', preset: next as DateRangePreset });
        }}
      >
        {DATE_RANGE_PRESETS.map((p) => (
          <option key={p.preset} value={p.preset}>
            {p.label}
          </option>
        ))}
        <option value='custom'>Custom</option>
        <option value='all-time'>All time</option>
      </NativeSelect>
      {value.kind === 'custom' && (
        <div className='flex items-center gap-1'>
          <Input type='date' aria-label={`Start of ${label}`} className='h-8' value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className='text-muted-foreground'>–</span>
          <Input type='date' aria-label={`End of ${label}`} className='h-8' value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
