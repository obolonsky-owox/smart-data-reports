export interface UserFacingError {
  message: string;
  detail?: string;
  retryable: boolean;
  status?: number;
  code?: string;
}

interface TransportPayload { code: string; status?: number; message: string; details?: unknown }

function transportPayload(error: unknown): TransportPayload | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const candidate = current as { name?: unknown; payload?: unknown; cause?: unknown };
    if (candidate.name === 'PluginTransportError' && candidate.payload && typeof candidate.payload === 'object') {
      return candidate.payload as TransportPayload;
    }
    current = candidate.cause;
  }
  return undefined;
}

function backendMessage(details: unknown): string | undefined {
  if (typeof details === 'string') return details;
  if (!details || typeof details !== 'object') return undefined;
  const message = (details as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join(' ');
  return undefined;
}

export function errorStatus(error: unknown): number | undefined {
  const status = transportPayload(error)?.status ?? (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

export function describeError(error: unknown, subject = 'this data'): UserFacingError {
  if (isAbortError(error)) return { message: 'The query was cancelled.', retryable: false, code: 'ABORTED' };
  const payload = transportPayload(error);
  const status = errorStatus(error);
  const code = payload?.code ?? ((error as { code?: unknown } | null)?.code as string | undefined);
  const raw = backendMessage(payload?.details) ?? payload?.message ?? (error instanceof Error ? error.message : String(error));

  if (code === 'SUSPENDED') return { message: 'This plugin was suspended by an administrator.', retryable: false, code, status };
  if (code === 'FORBIDDEN' || status === 403) return { message: `You don't have access to ${subject}.`, retryable: false, code, status };
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return { message: "Couldn't reach OWOX Data Marts.", retryable: true, code, status };
  if (status === 404) return { message: 'Not found. It may have been deleted.', retryable: false, code, status };
  if (status !== undefined && status >= 400 && status < 500) return { message: raw, retryable: false, code, status };
  return { message: 'Something went wrong.', detail: raw, retryable: true, code, status };
}
