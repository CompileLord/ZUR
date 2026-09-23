import type { UserCapability, TokenScope } from './types/index.ts';

export const TOKEN_SCOPE_PRESETS: Record<'read_only' | 'draft_authoring' | 'full_course_control', TokenScope[]> = {
  read_only: ['courses:read'],
  draft_authoring: [
    'courses:read',
    'courses:create',
    'content:write',
    'media:write',
    'exercises:validate',
  ],
  full_course_control: [
    'courses:read',
    'courses:create',
    'content:write',
    'content:delete',
    'media:write',
    'exercises:validate',
    'courses:publish',
    'courses:manage',
  ],
};

export const ALL_TOKEN_SCOPES: TokenScope[] = [
  'courses:read',
  'courses:create',
  'content:write',
  'content:delete',
  'media:write',
  'exercises:validate',
  'courses:publish',
  'courses:manage',
];

export interface AuthorizationContext {
  userId?: string | null;
  capabilities: UserCapability[];
  isSuspended?: boolean;
  tokenScopes?: TokenScope[] | null;
  tokenCourseRestrictions?: string[] | null;
}

export function hasCapability(ctx: AuthorizationContext, capability: UserCapability): boolean {
  if (ctx.isSuspended) return false;
  return ctx.capabilities.includes(capability);
}

export function isCourseOwner(ctx: AuthorizationContext, courseOwnerId: string): boolean {
  if (ctx.isSuspended) return false;
  return Boolean(ctx.userId && ctx.userId === courseOwnerId);
}

export function canAccessCourseContent(
  ctx: AuthorizationContext,
  course: { ownerId: string; visibility: string; isSuspended: boolean },
  isEnrolled: boolean
): boolean {
  if (course.isSuspended && !hasCapability(ctx, 'admin')) {
    return false;
  }
  if (isCourseOwner(ctx, course.ownerId)) {
    return true;
  }
  if (hasCapability(ctx, 'admin')) {
    return true;
  }
  return isEnrolled;
}

export function hasTokenScope(
  grantedScopes: TokenScope[],
  requiredScope: TokenScope
): boolean {
  return grantedScopes.includes(requiredScope);
}

export function isCoursePermittedForToken(
  courseRestrictions: string[] | null,
  courseId: string
): boolean {
  if (courseRestrictions === null) {
    return true; // All owned courses permitted
  }
  return courseRestrictions.includes(courseId);
}
