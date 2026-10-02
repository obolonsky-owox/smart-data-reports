export interface UserFacingError {
  message: string;
  detail?: string;
  retryable: boolean;
  status?: number;
  code?: string;
}

interface TransportPayload { code: string; status?: number; message: string; details?: unknown }

function findInCauseChain<T>(error: unknown, predicate: (candidate: unknown) => T | undefined): T | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const result = predicate(current);
    if (result !== undefined) return result;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function transportPayload(error: unknown): TransportPayload | undefined {
  return findInCauseChain(error, (candidate) => {
    const c = candidate as { name?: unknown; payload?: unknown };
    if (c.name === 'PluginTransportError' && c.payload && typeof c.payload === 'object') {
      return c.payload as TransportPayload;
    }
    return undefined;
  });
}

function backendMessage(details: unknown): string | undefined {
  if (typeof details === 'string') return details;
  if (!details || typeof details !== 'object') return undefined;
  const message = (details as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join(' ');
  return undefined;
}

/** Framework defaults that say nothing beyond the status code. */
const GENERIC_FORBIDDEN = /^(forbidden( resource)?|access denied)\.?$/i;

export function errorStatus(error: unknown): number | undefined {
  const status = transportPayload(error)?.status ?? (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isAbortError(error: unknown): boolean {
  return findInCauseChain(error, (candidate) => {
    const c = candidate as { name?: unknown };
    return c.name === 'AbortError' ? true : undefined;
  }) ?? false;
}

export function describeError(error: unknown, subject = 'this data'): UserFacingError {
  if (isAbortError(error)) return { message: 'The query was cancelled.', retryable: false, code: 'ABORTED' };
  const payload = transportPayload(error);
  const status = errorStatus(error);
  const code = payload?.code ?? ((error as { code?: unknown } | null)?.code as string | undefined);
  const raw = backendMessage(payload?.details) ?? payload?.message ?? (error instanceof Error ? error.message : String(error));

  if (code === 'SUSPENDED') return { message: 'This plugin was suspended by an administrator.', retryable: false, code, status };
  if (code === 'FORBIDDEN' || status === 403) {
    // ODM explains some refusals, e.g. that only report owners may change a report.
    const reason = backendMessage(payload?.details)?.trim();
    const message = reason && !GENERIC_FORBIDDEN.test(reason) ? reason : `You don't have access to ${subject}.`;
    return { message, retryable: false, code, status };
  }
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return { message: "Couldn't reach OWOX Data Marts.", retryable: true, code, status };
  if (status === 404) return { message: 'Not found. It may have been deleted.', retryable: false, code, status };
  if (status !== undefined && status >= 400 && status < 500) return { message: raw, retryable: false, code, status };
  return { message: 'Something went wrong.', detail: raw, retryable: true, code, status };
}
