import { ArrowLeft } from 'lucide-react';
import { Button } from '@owox/ui/components/button';

export function EditorPage({ onBack }: { reportId?: string; onBack(): void }) {
  return (
    <div className='dm-page' data-testid='editorPage'>
      <header className='dm-page-header flex items-center gap-2'>
        <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back to reports'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h1 className='dm-page-header-title'>New report</h1>
      </header>
    </div>
  );
}
