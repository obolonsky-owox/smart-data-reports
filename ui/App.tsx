import { useEffect, useMemo, useState } from 'react';
import type { PluginContext } from '@owox/plugin-sdk';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@owox/ui/components/tooltip';
import { ServicesProvider, servicesFromContext } from './services';
import { ReportsListPage } from './features/reports-list/ReportsListPage';
import { EditorPage } from './features/editor/EditorPage';
import { routeOf, screenOf, type Screen } from './lib/routes';

export function App({ context }: { context: PluginContext }) {
  const services = useMemo(() => servicesFromContext(context), [context]);
  // A shared link only chooses the first screen; it never saves or runs anything by itself.
  const [screen, setScreen] = useState<Screen>(() => screenOf(services.route));

  useEffect(() => {
    services.setRoute(routeOf(screen));
  }, [services, screen]);

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
