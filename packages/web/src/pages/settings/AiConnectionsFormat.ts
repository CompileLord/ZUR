import type { TokenScope } from 'zur-shared';

export function formatScopeSummary(scopes: TokenScope[]): string {
  const scopeSet = new Set(scopes);
  if (
    scopeSet.has('courses:read') &&
    scopeSet.has('courses:create') &&
    scopeSet.has('content:write') &&
    scopeSet.has('content:delete') &&
    scopeSet.has('media:write') &&
    scopeSet.has('exercises:validate') &&
    scopeSet.has('courses:publish') &&
    scopeSet.has('courses:manage')
  ) {
    return 'Full course control';
  }
  if (
    scopeSet.has('courses:read') &&
    scopeSet.has('courses:create') &&
    scopeSet.has('content:write') &&
    scopeSet.has('media:write') &&
    scopeSet.has('exercises:validate') &&
    !scopeSet.has('courses:publish') &&
    !scopeSet.has('content:delete')
  ) {
    return 'Draft authoring';
  }
  if (scopes.length === 1 && scopeSet.has('courses:read')) {
    return 'Read only';
  }
  return `${scopes.length} custom scopes`;
}

export function formatCourseRestrictions(restrictions: string[] | null, coursesMap?: Map<string, string>): string {
  if (restrictions === null) {
    return 'All owned courses, including future courses';
  }
  if (restrictions.length === 0) {
    return 'Created courses only';
  }
  if (restrictions.length === 1 && coursesMap && coursesMap.has(restrictions[0])) {
    return coursesMap.get(restrictions[0])!;
  }
  return `${restrictions.length} selected courses`;
}

export function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
