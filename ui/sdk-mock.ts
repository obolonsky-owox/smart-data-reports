import type { PluginContext } from '@owox/plugin-sdk';

let theme: 'light' | 'dark' = 'light';
let context: PluginContext | undefined;

export async function connect(): Promise<PluginContext> {
  context ??= {
    pluginId: 'smart-data-reports-dev',
    installationId: 'local',
    projectId: 'demo-project',
    userId: 'demo-user',
    theme,
    owox: {},
    credentials: {},
    collections: () => {
      throw new Error('Mock collections are added in Task 13');
    },
    ui: {
      async openExternal(url: string) {
        console.info('[mock] openExternal', url);
      },
      navigate(path: string) {
        console.info('[mock] navigate', path);
      },
    },
    signal: new AbortController().signal,
  } as unknown as PluginContext;
  return context;
}

export function __setTheme(next: 'light' | 'dark'): void {
  theme = next;
}

export function __resetForTests(): void {
  context = undefined;
  theme = 'light';
}
