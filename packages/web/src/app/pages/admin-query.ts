const ENUMS: Record<string, Record<string, string[]>> = {
  '/admin/reports': { status: ['open', 'investigating', 'resolved'] },
  '/admin/users': {
    status: ['active', 'suspended', 'pending_deletion', 'purged'],
    capability: ['student', 'author', 'admin'],
  },
};

function validInteger(value: string, min: number, max: number): boolean {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
}

export function sanitizeAdminPath(path: string): string {
  const [route, query = ''] = path.split('?');
  if (!query) return route;
  const enums = ENUMS[route] || {};
  const kept = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) {
    if (key === 'limit' && !validInteger(value, 1, 100)) continue;
    if (key === 'offset' && !validInteger(value, 0, Number.MAX_SAFE_INTEGER)) continue;
    if (enums[key] && !enums[key].includes(value)) continue;
    kept.append(key, value);
  }
  const search = kept.toString();
  return search ? `${route}?${search}` : route;
}
