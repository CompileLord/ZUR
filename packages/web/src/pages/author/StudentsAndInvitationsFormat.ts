export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'No activity yet';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'No activity yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return 'Just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}
