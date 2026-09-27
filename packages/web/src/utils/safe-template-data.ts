import { escapeHtml } from './escape-html.ts';

/** Escape untrusted strings before interpolating them into component HTML. */
export function safeTemplateData<T>(value: T, preserveKeys: ReadonlySet<string> = new Set()): T {
  const walk = (item: unknown, key = ''): unknown => {
    if (typeof item === 'string') {
      if (preserveKeys.has(key)) return item;
      if (/^(returnEditorUrl|previousStepUrl|nextStepUrl|courseOverviewUrl)$/.test(key)) {
        return item.startsWith('/') && !item.startsWith('//') && !item.includes('\\')
          ? escapeHtml(item) : '#';
      }
      return escapeHtml(item);
    }
    if (Array.isArray(item)) return item.map(entry => walk(entry));
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([name, entry]) => [name, walk(entry, name)]));
    }
    return item;
  };
  return walk(value) as T;
}
