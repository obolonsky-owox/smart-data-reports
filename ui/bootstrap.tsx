import { Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Loader2 } from 'lucide-react';
import { App } from './App';
import { initializePlugin } from './lib/plugin-runtime';
import './styles/app.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className='p-8 text-sm text-destructive'>
        <h1 className='mb-2 text-base font-semibold'>Smart Data Reports stopped unexpectedly</h1>
        <p>{this.state.error.message}</p>
      </main>
    );
  }
}

function Connecting() {
  return (
    <main className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground' data-testid='connecting'>
      <Loader2 className='h-4 w-4 animate-spin text-primary' />
      Connecting to OWOX Data Marts…
    </main>
  );
}

export async function bootstrap(container = document.getElementById('root')!): Promise<Root> {
  const root = createRoot(container);
  // Painted before the handshake: connect() can take ten seconds to give up, and an empty
  // root for that long looks like a broken plugin.
  root.render(<Connecting />);
  try {
    const context = await initializePlugin();
    // The host sends the theme once, at mount; there is no change event.
    document.documentElement.classList.toggle('dark', context.theme === 'dark');
    root.render(
      <ErrorBoundary>
        <App context={context} />
      </ErrorBoundary>,
    );
  } catch (error) {
    root.render(
      <main className='p-8 text-sm text-destructive' data-testid='connectError'>
        Could not connect to OWOX Data Marts: {error instanceof Error ? error.message : String(error)}
      </main>,
    );
  }
  return root;
}
