import type { AuthClient } from '../services/auth-client.ts';
import type { RouteDefinition } from '../router/routes.ts';

export type AppUser = NonNullable<ReturnType<AuthClient['getUser']>>;

/** What the route-shell render functions receive from renderAppNow. */
export interface RouteContext {
  route: RouteDefinition;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  currentUser: ReturnType<AuthClient['getUser']>;
  path: string;
}
