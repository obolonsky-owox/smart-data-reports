import type { ReportRunStatus } from './odm-types';
import type { OdmApi, WaitOptions } from './odm-api';
import { toReadPlan, toReportConfig } from './read-plan';
import type { ReportDraft } from './report-draft';
import { configHash, type LinkedReport } from './report-store';
import { errorStatus } from './errors';

export type SheetsApi = Pick<OdmApi, 'createSpreadsheet' | 'createReport' | 'updateReport' | 'runReportAndWait'>;

export interface SyncOutcome { linked: LinkedReport; runStatus: ReportRunStatus; runError?: string }

/**
 * Creates the spreadsheet and the ODM report, hands the link to `onLinked` so the caller can
 * store it, and only then runs the report: a failed or abandoned run never orphans them.
 */
export async function createLinkedReport(
  api: SheetsApi,
  input: { title: string; destinationId: string; draft: ReportDraft; today?: Date },
  wait: WaitOptions = {},
  onLinked: (linked: LinkedReport) => Promise<void> | void = () => undefined,
): Promise<SyncOutcome> {
  const sheet = await api.createSpreadsheet(input.destinationId, input.title);
  const config = toReportConfig(toReadPlan(input.draft, input.today));
  const { id } = await api.createReport(input.draft.mainDataMartId, {
    title: input.title,
    destinationId: input.destinationId,
    spreadsheetId: sheet.spreadsheetId,
    sheetId: sheet.sheetId,
    config,
  });
  const linked: LinkedReport = {
    reportId: id,
    destinationId: input.destinationId,
    spreadsheetId: sheet.spreadsheetId,
    sheetId: sheet.sheetId,
    syncedDraftHash: configHash(input.draft),
    dataMartId: input.draft.mainDataMartId,
  };
  await onLinked(linked);
  const run = await api.runReportAndWait(id, wait);
  return { linked, runStatus: run.status, runError: run.error };
}

/** Pushes the current configuration into the same ODM report and spreadsheet, then runs it. */
export async function updateLinkedReport(
  api: SheetsApi,
  linked: LinkedReport,
  input: { title: string; draft: ReportDraft; today?: Date },
  wait: WaitOptions = {},
): Promise<SyncOutcome | { missing: true }> {
  try {
    await api.updateReport(linked.reportId, {
      title: input.title,
      destinationId: linked.destinationId,
      spreadsheetId: linked.spreadsheetId,
      sheetId: linked.sheetId,
      config: toReportConfig(toReadPlan(input.draft, input.today)),
    });
  } catch (error) {
    if (errorStatus(error) === 404) return { missing: true };
    throw error;
  }
  const run = await api.runReportAndWait(linked.reportId, wait);
  return { linked: { ...linked, syncedDraftHash: configHash(input.draft) }, runStatus: run.status, runError: run.error };
}

export function spreadsheetUrl(linked: Pick<LinkedReport, 'spreadsheetId' | 'sheetId'>): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(linked.spreadsheetId)}/edit#gid=${linked.sheetId}`;
}

/** The data mart's Destinations tab; with `reportId`, ODM opens that report's sheet, like its own "Copy link". */
export function odmReportsPath(projectId: string, dataMartId: string, reportId?: string): string {
  const path = `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(dataMartId)}/reports`;
  return reportId ? `${path}?reportId=${encodeURIComponent(reportId)}` : path;
}

export function odmDestinationsPath(projectId: string): string {
  return `/ui/${encodeURIComponent(projectId)}/data-destinations`;
}
