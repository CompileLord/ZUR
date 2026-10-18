/**
 * Shared deterministic course thumbnail colours. The same course id/title
 * always maps to the same palette entry on every surface (catalog, author
 * courses, learner Home).
 *
 * Palette: muted greens, teals, blues, a violet-blue and amber. Gradient start
 * lightness is capped so a white initial keeps >= 4.5:1 contrast.
 */
export interface CourseThumbColors {
  from: string;
  to: string;
  hue: number;
}

export const COURSE_THUMB_HUES: readonly number[] = [152, 168, 186, 204, 222, 140, 118, 34];

export function courseThumbColors(seed: string): CourseThumbColors {
  let h = 0;
  const s = String(seed ?? '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  const hue = COURSE_THUMB_HUES[h % COURSE_THUMB_HUES.length];
  const amber = hue === 34;
  return {
    hue,
    from: `hsl(${hue} ${amber ? 52 : 46}% 30%)`,
    to: `hsl(${(hue + 18) % 360} ${amber ? 48 : 44}% 20%)`,
  };
}

/** Inline style that overrides any stylesheet thumbnail background. */
export function courseThumbStyle(seed: string): string {
  const c = courseThumbColors(seed);
  return `background: linear-gradient(135deg, ${c.from}, ${c.to}); color: #fff; --thumb-hue: ${c.hue}`;
}

export function courseInitial(title: string): string {
  const clean = String(title ?? '').replace(/&[#a-z0-9]+;/gi, '').trim();
  return (clean.charAt(0) || '?').toUpperCase();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export interface CourseThumbOptions {
  seed: string;
  title: string;
  className: string;
  /** Renders an <a> when given, otherwise a <span>. */
  href?: string;
  initialClassName?: string;
}

export function renderCourseThumb(o: CourseThumbOptions): string {
  const inner = `<span${o.initialClassName ? ` class="${o.initialClassName}"` : ''}>${esc(courseInitial(o.title))}</span>`;
  const style = esc(courseThumbStyle(o.seed));
  return o.href
    ? `<a class="${o.className}" href="${esc(o.href)}" tabindex="-1" aria-hidden="true" style="${style}">${inner}</a>`
    : `<span class="${o.className}" aria-hidden="true" style="${style}">${inner}</span>`;
}
