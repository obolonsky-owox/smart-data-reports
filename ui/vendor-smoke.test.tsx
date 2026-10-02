import { render, screen } from '@testing-library/react';
import { Button } from '@owox/ui/components/button';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { cn } from '@owox/ui/lib/utils';

it('renders vendored primitives with ODM classes', () => {
  render(
    <>
      <Button>Apply</Button>
      <Tabs defaultValue='a'>
        <TabsList>
          <TabsTrigger value='a'>Data table</TabsTrigger>
        </TabsList>
      </Tabs>
    </>,
  );
  expect(screen.getByRole('button', { name: 'Apply' }).className).toContain('bg-primary');
  expect(screen.getByRole('tab', { name: 'Data table' })).toHaveAttribute('data-state', 'active');
  expect(cn('px-2', 'px-4')).toBe('px-4');
});
