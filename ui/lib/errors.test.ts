import { describeError, errorStatus, isAbortError } from './errors';

function transportError(payload: { code: string; status?: number; message: string; details?: unknown }) {
  return Object.assign(new Error(payload.message), { name: 'PluginTransportError', payload });
}

it('explains missing access', () => {
  expect(describeError(transportError({ code: 'HTTP_ERROR', status: 403, message: 'Forbidden' }), 'Session').message)
    .toBe("You don't have access to Session.");
  expect(describeError(transportError({ code: 'FORBIDDEN', message: 'Refused' })).retryable).toBe(false);
});

it("shows ODM's own reason for a refusal, but not a generic one", () => {
  const owner = transportError({
    code: 'HTTP_ERROR', status: 403, message: 'Forbidden',
    details: { message: 'You are not an owner of this report.', error: 'Forbidden', statusCode: 403 },
  });
  expect(describeError(owner, 'this report')).toMatchObject({ message: 'You are not an owner of this report.', retryable: false });
  const generic = transportError({ code: 'HTTP_ERROR', status: 403, message: 'Forbidden', details: { message: 'Forbidden resource' } });
  expect(describeError(generic, 'Session').message).toBe("You don't have access to Session.");
});

it('shows ODM validation messages as they are', () => {
  const error = transportError({
    code: 'HTTP_ERROR', status: 400, message: 'Bad Request',
    details: { message: 'HAVING is not supported on a joined metric.' },
  });
  expect(describeError(error)).toMatchObject({ message: 'HAVING is not supported on a joined metric.', retryable: false });
});

it('finds the transport error behind an API client wrapper', () => {
  const wrapped = Object.assign(new Error('Failed to open OWOX Data Mart data stream'), {
    name: 'OWOXApiError',
    cause: transportError({ code: 'NETWORK_ERROR', message: 'offline' }),
  });
  expect(describeError(wrapped)).toMatchObject({ message: "Couldn't reach OWOX Data Marts.", retryable: true });
});

it('handles suspension, not-found, aborts and unknown failures', () => {
  expect(describeError(transportError({ code: 'SUSPENDED', message: 'x' })).message).toBe('This plugin was suspended by an administrator.');
  expect(errorStatus(transportError({ code: 'HTTP_ERROR', status: 404, message: 'Not Found' }))).toBe(404);
  const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
  expect(isAbortError(abort)).toBe(true);
  expect(describeError(new Error('boom'))).toEqual({ message: 'Something went wrong.', detail: 'boom', retryable: true, code: undefined, status: undefined });
});

it('recognises cancellations wrapped by the API client', () => {
  const wrappedAbort = Object.assign(new Error('Failed to open OWOX Data Mart data stream'), {
    name: 'OWOXApiError',
    cause: Object.assign(new Error('Aborted'), { name: 'AbortError' }),
  });
  expect(isAbortError(wrappedAbort)).toBe(true);
  expect(describeError(wrappedAbort)).toEqual({ message: 'The query was cancelled.', retryable: false, code: 'ABORTED' });
});
