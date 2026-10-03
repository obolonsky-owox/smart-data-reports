import { coerceFilterValue, describeFilter, isFilterValueMissing, operatorsFor } from './filter-operators';

it('offers operators by field kind', () => {
  expect(operatorsFor('text').map((o) => o.label)).toEqual([
    'is', 'is not', 'contains', "doesn't contain", 'starts with', 'ends with', 'is any of', 'is empty', 'is not empty',
  ]);
  expect(operatorsFor('number').map((o) => o.operator)).toContain('between');
  expect(operatorsFor('boolean').map((o) => o.operator)).toEqual(['is_true', 'is_false']);
  expect(operatorsFor('date')).toEqual([]);
});

it('coerces raw input into ODM filter values', () => {
  expect(coerceFilterValue('number', 'single', '42')).toBe(42);
  expect(coerceFilterValue('text', 'list', 'a, b\nc')).toEqual(['a', 'b', 'c']);
  expect(coerceFilterValue('number', 'list', '1,2')).toEqual([1, 2]);
  expect(coerceFilterValue('number', 'range', { from: '1', to: '5' })).toEqual({ from: 1, to: 5 });
});

it('summarises a filter for chips', () => {
  const base = { id: 'f', column: 'c', aliasPath: '', sliceOnly: false };
  expect(describeFilter({ ...base, operator: 'is_not_blank' })).toBe('is not empty');
  expect(describeFilter({ ...base, operator: 'eq', value: 'google' })).toBe('is google');
  expect(describeFilter({ ...base, operator: 'in', value: ['a', 'b', 'c', 'd'] })).toBe('is any of 4 values');
  expect(describeFilter({ ...base, operator: 'between', value: { from: 1, to: 5 } })).toBe('between 1 – 5');
});

it('keeps blank numeric input blank instead of coercing it to 0', () => {
  expect(coerceFilterValue('number', 'single', '  ')).toBe('');
  expect(coerceFilterValue('number', 'range', { from: ' ', to: '5' })).toEqual({ from: '', to: 5 });
  expect(coerceFilterValue('number', 'range', { from: '1', to: '' })).toEqual({ from: 1, to: '' });
  expect(coerceFilterValue('number', 'single', 'abc')).toBeNaN();
  expect(coerceFilterValue('number', 'list', '1, , 2')).toEqual([1, 2]);
});

it('uses the field kind to pick the operator label', () => {
  const base = { id: 'f', column: 'c', aliasPath: '', sliceOnly: false };
  expect(describeFilter({ ...base, operator: 'eq', value: 42 }, 'number')).toBe('= 42');
  expect(describeFilter({ ...base, operator: 'neq', value: 42 }, 'number')).toBe('≠ 42');
  expect(describeFilter({ ...base, operator: 'eq', value: 'x' }, 'text')).toBe('is x');
  expect(describeFilter({ ...base, operator: 'eq', value: 'x' })).toBe('is x');
});

it('tells when an operator that takes a value has none', () => {
  expect(isFilterValueMissing('none', undefined)).toBe(false);
  expect(isFilterValueMissing('single', '')).toBe(true);
  expect(isFilterValueMissing('single', 0)).toBe(false);
  expect(isFilterValueMissing('list', [])).toBe(true);
  expect(isFilterValueMissing('list', ['a'])).toBe(false);
  expect(isFilterValueMissing('range', { from: 1, to: '' })).toBe(true);
  expect(isFilterValueMissing('range', { from: 1, to: 5 })).toBe(false);
});
