import { createContext, useContext, type ReactNode } from 'react';
import type { PluginContext } from '@owox/plugin-sdk';
import { createOdmApi, type OdmApi, type OwoxClient } from './lib/odm-api';
import { createReportStore, REPORTS_COLLECTION, type ReportStore, type StoredReport } from './lib/report-store';
import { createSnapshotStore, SNAPSHOTS_COLLECTION, type RunSnapshot, type SnapshotStore } from './lib/run-snapshot';

export interface Services {
  api: OdmApi;
  store: ReportStore;
  snapshots: SnapshotStore;
  projectId: string;
  userId: string;
  theme: 'light' | 'dark';
  /** How often report runs are polled; tests set 0. */
  pollIntervalMs: number;
  openExternal(url: string): void;
  navigate(path: string): void;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}

export function servicesFromContext(ctx: PluginContext): Services {
  return {
    // ctx.owox is the full OWOX API client; OwoxClient is the structural subset we call.
    api: createOdmApi(ctx.owox as unknown as OwoxClient),
    store: createReportStore(ctx.collections<StoredReport>(REPORTS_COLLECTION)),
    snapshots: createSnapshotStore(ctx.collections<RunSnapshot>(SNAPSHOTS_COLLECTION)),
    projectId: ctx.projectId,
    userId: ctx.userId,
    theme: ctx.theme,
    pollIntervalMs: 2000,
    openExternal: (url) => void ctx.ui.openExternal(url),
    navigate: (path) => ctx.ui.navigate(path),
  };
}
