import { useMemo, useState } from 'react';
import type { PluginContext } from '@owox/plugin-sdk';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { ServicesProvider, servicesFromContext } from './services';
import { ReportsListPage } from './features/reports-list/ReportsListPage';
import { EditorPage } from './features/editor/EditorPage';

type Screen = { kind: 'list' } | { kind: 'editor'; reportId?: string };

export function App({ context }: { context: PluginContext }) {
  const services = useMemo(() => servicesFromContext(context), [context]);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  return (
    <ServicesProvider services={services}>
      <TooltipProvider>
        <Toaster position='bottom-right' theme={services.theme} />
        {screen.kind === 'list' ? (
          <ReportsListPage
            onOpen={(reportId) => setScreen({ kind: 'editor', reportId })}
            onCreate={() => setScreen({ kind: 'editor' })}
          />
        ) : (
          <EditorPage key={screen.reportId ?? 'new'} reportId={screen.reportId} onBack={() => setScreen({ kind: 'list' })} />
        )}
      </TooltipProvider>
    </ServicesProvider>
  );
}
