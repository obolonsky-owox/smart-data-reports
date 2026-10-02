import { connect, type PluginContext } from '@owox/plugin-sdk';

let contextPromise: Promise<PluginContext> | undefined;

/** Connects once per page; every caller shares the same handshake. */
export function initializePlugin(): Promise<PluginContext> {
  contextPromise ??= connect();
  return contextPromise;
}

export function resetPluginContextForTests(): void {
  contextPromise = undefined;
}
