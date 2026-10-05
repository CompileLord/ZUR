/**
 * Shared formatting utilities.
 * Ensures sentence case, humanized enums, dates, durations, and initials.
 */

export function humanizeEnum(val?: string | null): string {
  if (!val) return '';
  const s = String(val).trim().replace(/[_-]+/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function sentenceCase(val?: string | null): string {
  if (!val) return '';
  const s = String(val).trim();
  // If ALL CAPS or snake_case, convert
  if (s === s.toUpperCase()) {
    const lower = s.replace(/_/g, ' ').toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);

  if (diffSec >= 0 && diffSec < 60) {
    return 'just now';
  }
  if (diffSec >= 60 && diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m}m ago`;
  }
  if (diffSec >= 3600 && diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h}h ago`;
  }
  if (diffSec >= 86400 && diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days}d ago`;
  }

  // Format as e.g. "Oct 3, 1:50 PM"
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `~${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

export function initials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
