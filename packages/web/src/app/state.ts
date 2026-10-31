import { AuthClient } from '../services/auth-client.ts';
import { CourseClient } from '../services/course-client.ts';
import type { ProfileGuard } from '../services/profile-guard.ts';
import type { AppearanceSaveQueue } from '../services/appearance-save-queue.ts';

export const appEl = document.getElementById('app')!;
export const authClient = AuthClient.getInstance();
export const courseClient = CourseClient.getInstance();

/** Mutable state shared by the app modules. Importers cannot assign to plain `let` exports, so it lives on this object. */
export const app = {
  cleanupLandingHero: null as (() => void) | null,
  activeProfileGuard: null as ProfileGuard | null,
  activeProfileCleanup: null as (() => void) | null,
  activeModalCleanup: null as (() => void) | null,
  activeModalKeydownListener: null as ((e: KeyboardEvent) => void) | null,
  activeRouteLifecycle: 0,
  activeAppearanceQueue: null as AppearanceSaveQueue | null,
  activeAppearanceCleanup: null as (() => void) | null,
  lessonVideoLoadTimer: undefined as number | undefined,
  lessonVideoReadyCleanup: undefined as (() => void) | undefined,
  workspaceResizeController: null as AbortController | null,
  lastActiveAdminTrigger: null as HTMLElement | null,
};
