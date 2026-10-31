import { getSafeReturnDestination } from '../router/routes.ts';
import { navigateTo } from './navigation.ts';
import { authClient } from './state.ts';

export async function s2Request(url: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      handleSessionExpired();
    }
    const err: any = new Error(data.error?.message || 'The request failed. Please try again.');
    err.status = response.status;
    err.statusCode = response.status;
    err.code = data.error?.code;
    err.details = data.error?.details;
    throw err;
  }
  return data;
}

let sessionExpiredHandling = false;
export function handleSessionExpired(detail?: { path?: string }): void {
  if (sessionExpiredHandling || window.location.pathname.startsWith('/sign-in')) return;
  sessionExpiredHandling = true;
  setTimeout(() => { sessionExpiredHandling = false; }, 3000);
  authClient.clearSession();
  const returnTo = getSafeReturnDestination(window.location.pathname + window.location.search);
  void detail;
  navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}&notice=session-expired`);
}
