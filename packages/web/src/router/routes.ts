export type ShellId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export interface RouteDefinition {
  pageId: string;
  path: string;
  pattern: RegExp;
  paramNames: string[];
  shell: ShellId;
  title: string;
  requiredCapability?: 'student' | 'author' | 'admin';
}

function createRoute(
  pageId: string,
  path: string,
  shell: ShellId,
  title: string,
  requiredCapability?: 'student' | 'author' | 'admin'
): RouteDefinition {
  const paramNames: string[] = [];
  const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const pattern = new RegExp(`^${regexPath}$`);

  return {
    pageId,
    path,
    pattern,
    paramNames,
    shell,
    title,
    requiredCapability,
  };
}

/**
 * Authoritative P01–P45 Route Contract (design.md §9)
 */
export const ROUTES: RouteDefinition[] = [
  // Public & Account (P01–P08)
  createRoute('P01', '/', 'S1', 'Understand it. Then write it.'),
  createRoute('P02', '/courses', 'S1', 'Explore courses'),
  createRoute('P03', '/courses/:courseId', 'S1', 'Course Overview'),
  createRoute('P04', '/sign-in', 'S2', 'Welcome back'),
  createRoute('P05', '/sign-up', 'S2', 'Create your account'),
  createRoute('P06', '/verify-email', 'S2', 'Check your email'),
  createRoute('P07', '/forgot-password', 'S2', 'Reset password'),
  createRoute('P07', '/reset-password', 'S2', 'Update password'),
  createRoute('P08', '/join/:token', 'S2', 'Join course'),

  // Student Experience (P09–P16)
  createRoute('P09', '/learn', 'S3', 'Continue learning', 'student'),
  createRoute('P10', '/learn/courses', 'S3', 'My courses', 'student'),
  createRoute('P11', '/learn/:enrollmentId', 'S3', 'Course Overview', 'student'),
  createRoute('P12', '/learn/:enrollmentId/steps/:stepId', 'S4', 'Theory Step', 'student'),
  createRoute('P13', '/learn/:enrollmentId/steps/:stepId/video', 'S4', 'Video Step', 'student'),
  createRoute('P14', '/learn/:enrollmentId/steps/:stepId/quiz', 'S4', 'Quiz Step', 'student'),
  createRoute('P15', '/learn/:enrollmentId/steps/:stepId/code', 'S4', 'Python Workspace', 'student'),
  createRoute('P16', '/learn/:enrollmentId/steps/:stepId/attempts/:attemptId', 'S4', 'Attempt Detail', 'student'),

  // Account Settings (P17–P20)
  createRoute('P17', '/settings/profile', 'S3', 'Profile settings', 'student'),
  createRoute('P18', '/settings/appearance', 'S3', 'Appearance settings', 'student'),
  createRoute('P19', '/settings/security', 'S3', 'Security settings', 'student'),
  createRoute('P20', '/settings/privacy', 'S3', 'Privacy and account requests', 'student'),

  // Author Experience (P21–P31)
  createRoute('P21', '/teach', 'S3', 'Your courses', 'author'),
  createRoute('P22', '/teach/:courseId/content', 'S5', 'Course builder', 'author'),
  createRoute('P23', '/teach/:courseId/content/theory/:stepId', 'S5', 'Theory editor', 'author'),
  createRoute('P24', '/teach/:courseId/content/quiz/:stepId', 'S5', 'Quiz editor', 'author'),
  createRoute('P25', '/teach/:courseId/content/python/:stepId', 'S5', 'Python exercise editor', 'author'),
  createRoute('P26', '/teach/:courseId/preview', 'S4', 'Student preview', 'author'),
  createRoute('P27', '/teach/:courseId/publish', 'S5', 'Review publication', 'author'),
  createRoute('P28', '/teach/:courseId/students', 'S5', 'Students and invitations', 'author'),
  createRoute('P28', '/teach/:courseId/roster', 'S5', 'Students and invitations', 'author'),
  createRoute('P29', '/teach/:courseId/students/:enrollmentId', 'S5', 'Student detail', 'author'),
  createRoute('P30', '/teach/:courseId/analytics', 'S5', 'Course analytics', 'author'),
  createRoute('P31', '/teach/:courseId/settings', 'S5', 'Course settings', 'author'),

  // Administration (P32–P39)
  createRoute('P32', '/admin', 'S6', 'Operations overview', 'admin'),
  createRoute('P33', '/admin/users', 'S6', 'Users and capabilities', 'admin'),
  createRoute('P33', '/admin/users/:userId', 'S6', 'User detail', 'admin'),
  createRoute('P34', '/admin/courses', 'S6', 'Courses administration', 'admin'),
  createRoute('P34', '/admin/courses/:courseId', 'S6', 'Course detail', 'admin'),
  createRoute('P35', '/admin/categories', 'S6', 'Categories administration', 'admin'),
  createRoute('P36', '/admin/reports', 'S6', 'Reports and issue triage', 'admin'),
  createRoute('P36', '/admin/reports/:reportId', 'S6', 'Report detail', 'admin'),
  createRoute('P37', '/admin/media', 'S6', 'Media operations', 'admin'),
  createRoute('P38', '/admin/execution', 'S6', 'Execution operations', 'admin'),
  createRoute('P39', '/admin/audit', 'S6', 'Audit log', 'admin'),

  // Public Legal & Support (P40–P42)
  createRoute('P40', '/help', 'S1', 'Help and reporting'),
  createRoute('P41', '/privacy', 'S1', 'Privacy Policy'),
  createRoute('P41', '/terms', 'S1', 'Terms of Service'),
  createRoute('P42', '/access-denied', 'S1', "This page isn't available."),
  createRoute('P42', '/not-found', 'S1', "This page isn't available."),

  // MCP Connections & Activity (P43–P45)
  createRoute('P43', '/settings/ai-connections', 'S3', 'AI connections', 'author'),
  createRoute('P44', '/settings/ai-connections/:connectionId/setup', 'S3', 'Connection setup and verification', 'author'),
  createRoute('P45', '/teach/:courseId/activity', 'S5', 'Agent activity and draft recovery', 'author'),
];

export interface MatchResult {
  route: RouteDefinition;
  params: Record<string, string>;
}

export function matchRoute(path: string): MatchResult | null {
  const cleanPath = path.split('?')[0].replace(/\/+$/, '') || '/';

  for (const route of ROUTES) {
    const match = cleanPath.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(match[idx + 1]);
      });
      return { route, params };
    }
  }

  return null;
}

/**
 * Safe URL Query Filter: strips code, tokens, answers, and sensitive payloads from URLs (design §14, §17)
 */
export function sanitizeQueryParams(params: Record<string, string | undefined>): Record<string, string> {
  const allowedKeys = new Set([
    'q', 'category', 'level', 'language', 'filter', 'sort', 'page', 'tab',
    'status', 'version', 'range', 'actor', 'action'
  ]);

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value && allowedKeys.has(key)) {
      // Disallow code fragments or tokens
      if (value.length < 200 && !value.includes('token=') && !value.includes('secret')) {
        sanitized[key] = value.trim();
      }
    }
  }

  return sanitized;
}

/**
 * Validates return destination safely: internal relative paths only
 */
export function getSafeReturnDestination(destination?: string | null): string {
  if (!destination) return '/learn';
  const trimmed = destination.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return '/learn';
}
