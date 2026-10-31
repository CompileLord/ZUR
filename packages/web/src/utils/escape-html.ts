export function escapeHtml(value: string | null | undefined): string {
  return (value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

/**
 * Escapes text that may or may not have been escaped already (shared shells receive titles from
 * both styles of caller). Markup characters are always escaped; `&` is left alone only when it
 * already starts an entity, so nothing is double-escaped and nothing can become markup.
 */
export function escapeHtmlOnce(value: string | null | undefined): string {
  return (value || '').replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)|[<>"']/gi, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}
