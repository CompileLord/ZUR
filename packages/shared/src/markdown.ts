export type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

export interface BlockquoteBlock {
  type: 'blockquote';
  text: string;
}

export interface CalloutBlock {
  type: 'callout';
  calloutType: CalloutType;
  title?: string;
  text: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface TableBlock {
  type: 'table';
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
}

export interface DividerBlock {
  type: 'divider';
}

export interface ImageBlock {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  isDecorative?: boolean;
}

export type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | BlockquoteBlock
  | CalloutBlock
  | ListBlock
  | TableBlock
  | DividerBlock
  | ImageBlock;

export interface RichContentDocument {
  blocks: MarkdownBlock[];
}

/**
 * External image hosts allowed in Markdown images. Default: none. Course media
 * must use `zur-asset:<uuid>` references (the server rejects external images).
 */
export const ALLOWED_EXTERNAL_IMAGE_HOSTS: readonly string[] = [];

const NAMED_ENTITIES: Record<string, string> = {
  tab: '\t', newline: '\n', colon: ':', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  sol: '/', bsol: '\\', lpar: '(', rpar: ')', period: '.', num: '#', percnt: '%', excl: '!',
};

function decodeEntitiesOnce(input: string): string {
  return input.replace(/&(?:#x([0-9a-f]{1,8})|#(\d{1,9})|([a-z][a-z0-9]{1,15}));?/gi, (m, hex, dec, name) => {
    if (hex || dec) {
      const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    const v = NAMED_ENTITIES[String(name).toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Normalise a URL the way a browser would before it chooses a scheme. */
function normalizeUrlForCheck(raw: string): string {
  let v = String(raw);
  for (let i = 0; i < 4; i++) {
    let next = decodeEntitiesOnce(v);
    try {
      next = decodeURIComponent(next.replace(/%(?![0-9a-f]{2})/gi, '%25'));
    } catch {
      /* leave undecoded percent sequences */
    }
    if (next === v) break;
    v = next;
  }
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g, '');
}

/** Link allowlist: https, http, mailto, "/path" (not "//"), "#fragment", "./", "../" and scheme-less relative paths. */
export function isSafeLinkUrl(raw: string): boolean {
  const v = normalizeUrlForCheck(raw);
  if (!v) return false;
  if (v.startsWith('//') || v.startsWith('\\') || v.startsWith('/\\')) return false;
  if (v.startsWith('/') || v.startsWith('#') || v.startsWith('?')) return true;
  const scheme = v.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return ['https', 'http', 'mailto'].includes(scheme[1].toLowerCase());
  // No scheme: reject anything with a colon before the first path/query/fragment delimiter.
  return !/^[^/?#]*:/.test(v);
}

/** Image allowlist: zur-asset references, same-origin "/path", and https hosts listed in ALLOWED_EXTERNAL_IMAGE_HOSTS. */
export function isSafeImageUrl(raw: string): boolean {
  const trimmed = String(raw).trim();
  if (/^zur-asset:[0-9a-f-]{36}$/i.test(trimmed)) return true;
  const v = normalizeUrlForCheck(raw);
  if (!v || v.startsWith('//') || v.startsWith('\\') || v.startsWith('/\\')) return false;
  if (v.startsWith('/')) return true;
  if (/^https:\/\//i.test(v)) {
    try {
      return ALLOWED_EXTERNAL_IMAGE_HOSTS.includes(new URL(v).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Raw HTML is not part of the content contract: every tag-like token is removed
 * (script/style/etc. together with their content) and the renderer additionally
 * escapes all text, so nothing authored can become markup.
 */
const RAW_BLOCK_ELEMENTS = /<\s*(script|style|iframe|object|embed|applet|noscript|template|svg|math|textarea|title|xmp|noembed|noframes)\b[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const RAW_TAG = /<\s*[a-zA-Z\/!?][^>]*(?:>|$)/g;
const RAW_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

function stripRawHtml(input: string): string {
  let prev: string;
  let out = input.replace(/\u0000/g, '');
  let guard = 0;
  do {
    prev = out;
    out = out.replace(RAW_COMMENT, '').replace(RAW_BLOCK_ELEMENTS, '').replace(RAW_TAG, '');
  } while (out !== prev && ++guard < 8);
  return out;
}

const MD_LINK = /\[([^\[\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

const INLINE_CODE = /(`[^`\n]+`)/;

export function sanitizeHtml(rawHtml: string): string {
  // Inline code is literal text (always escaped on render), so `<class 'int'>` must survive.
  const clean = rawHtml.split(INLINE_CODE).map((part, i) => (i % 2 ? part.replace(/\u0000/g, '') : stripRawHtml(part))).join('');
  return clean.replace(MD_LINK, (match, label, url) => (isSafeLinkUrl(url) ? match : `[${label}](#)`));
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeMarkdown(markdown: string): string {
  const doc = parseMarkdown(markdown);
  return serializeMarkdown(doc);
}

export function parseMarkdown(markdown: string): RichContentDocument {
  const normalized = (markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    // Blank line
    if (!line.trim()) {
      idx++;
      continue;
    }

    // Fenced Code Block
    if (line.trim().startsWith('```')) {
      const language = line.trim().substring(3).trim();
      idx++;
      const codeLines: string[] = [];
      while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length && lines[idx].trim().startsWith('```')) {
        idx++; // consume closing ```
      }
      blocks.push({
        type: 'code',
        language: language || 'python',
        code: codeLines.join('\n'),
      });
      continue;
    }

    // Horizontal Divider
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'divider' });
      idx++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: 'heading',
        level,
        text: sanitizeHtml(headingMatch[2].trim()),
      });
      idx++;
      continue;
    }

    // Callout or Blockquote
    if (line.trim().startsWith('>')) {
      const bqLines: string[] = [];
      while (idx < lines.length && lines[idx].trim().startsWith('>')) {
        bqLines.push(lines[idx].replace(/^>\s?/, ''));
        idx++;
      }
      const bqText = bqLines.join('\n').trim();

      const calloutMatch = bqText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+(.*))?/i);
      if (calloutMatch) {
        const calloutType = calloutMatch[1].toLowerCase() as CalloutType;
        const remaining = bqLines.slice(1).join('\n').trim();
        const customTitle = calloutMatch[2] ? sanitizeHtml(calloutMatch[2].trim()) : undefined;
        blocks.push({
          type: 'callout',
          calloutType,
          title: customTitle,
          text: sanitizeHtml(remaining),
        });
      } else {
        blocks.push({
          type: 'blockquote',
          text: sanitizeHtml(bqText),
        });
      }
      continue;
    }

    // Image: standalone line ![alt](url "caption")
    const imgMatch = line.trim().match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)$/);
    if (imgMatch) {
      const alt = imgMatch[1] || '';
      let url = imgMatch[2] || '';
      const caption = imgMatch[3] || undefined;
      if (!isSafeImageUrl(url)) {
        url = '';
      }
      blocks.push({
        type: 'image',
        alt: sanitizeHtml(alt),
        url: url.trim(),
        caption: caption ? sanitizeHtml(caption) : undefined,
        isDecorative: alt === '',
      });
      idx++;
      continue;
    }

    // List: unordered (- or *) or ordered (1.)
    if (/^(\*|-|\d+\.)\s+/.test(line.trim())) {
      const isOrdered = /^\d+\.\s+/.test(line.trim());
      const items: string[] = [];
      while (idx < lines.length && /^(\*|-|\d+\.)\s+/.test(lines[idx].trim())) {
        const itemText = lines[idx].trim().replace(/^(\*|-|\d+\.)\s+/, '');
        items.push(sanitizeHtml(itemText));
        idx++;
      }
      blocks.push({
        type: 'list',
        ordered: isOrdered,
        items,
      });
      continue;
    }

    // Table: starts with | ... |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (idx < lines.length && lines[idx].trim().startsWith('|') && lines[idx].trim().endsWith('|')) {
        tableLines.push(lines[idx].trim());
        idx++;
      }
      if (tableLines.length >= 2) {
        const parseCells = (row: string) =>
          row
            .split('|')
            .slice(1, -1)
            .map((c) => sanitizeHtml(c.trim()));

        const headers = parseCells(tableLines[0]);
        const alignLine = tableLines[1];
        const alignCells = alignLine.split('|').slice(1, -1);
        const alignments: ('left' | 'center' | 'right')[] = alignCells.map((c) => {
          const trimmed = c.trim();
          if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
          if (trimmed.endsWith(':')) return 'right';
          return 'left';
        });

        const rows: string[][] = [];
        for (let r = 2; r < tableLines.length; r++) {
          rows.push(parseCells(tableLines[r]));
        }

        blocks.push({
          type: 'table',
          headers,
          alignments,
          rows,
        });
        continue;
      }
    }

    // Paragraph: collect lines until blank line or start of new block
    const paraLines: string[] = [];
    while (
      idx < lines.length &&
      lines[idx].trim() &&
      !lines[idx].trim().startsWith('```') &&
      !lines[idx].trim().startsWith('#') &&
      !lines[idx].trim().startsWith('>') &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[idx].trim()) &&
      !/^(\*|-|\d+\.)\s+/.test(lines[idx].trim()) &&
      !(lines[idx].trim().startsWith('|') && lines[idx].trim().endsWith('|'))
    ) {
      paraLines.push(lines[idx]);
      idx++;
    }

    const paraText = paraLines.join('\n').trim();
    if (paraText) {
      blocks.push({
        type: 'paragraph',
        text: sanitizeHtml(paraText),
      });
    }
  }

  return { blocks };
}

export function serializeMarkdown(doc: RichContentDocument): string {
  const parts: string[] = [];

  for (const block of doc.blocks) {
    switch (block.type) {
      case 'heading': {
        const hashes = '#'.repeat(block.level);
        parts.push(`${hashes} ${block.text}`);
        break;
      }
      case 'paragraph': {
        parts.push(block.text);
        break;
      }
      case 'code': {
        parts.push(`\`\`\`${block.language || ''}\n${block.code}\n\`\`\``);
        break;
      }
      case 'divider': {
        parts.push('---');
        break;
      }
      case 'blockquote': {
        const lines = block.text.split('\n');
        parts.push(lines.map((l) => `> ${l}`).join('\n'));
        break;
      }
      case 'callout': {
        const tag = block.calloutType.toUpperCase();
        const header = block.title ? `> [!${tag}] ${block.title}` : `> [!${tag}]`;
        const bodyLines = block.text ? block.text.split('\n').map((l) => `> ${l}`) : [];
        parts.push([header, ...bodyLines].join('\n'));
        break;
      }
      case 'list': {
        const listLines = block.items.map((item, i) => {
          const prefix = block.ordered ? `${i + 1}. ` : '- ';
          return `${prefix}${item}`;
        });
        parts.push(listLines.join('\n'));
        break;
      }
      case 'table': {
        const headerRow = `| ${block.headers.join(' | ')} |`;
        const alignRow = `| ${block.alignments
          .map((a) => {
            if (a === 'center') return ':---:';
            if (a === 'right') return '---:';
            return '---';
          })
          .join(' | ')} |`;
        const dataRows = block.rows.map((row) => `| ${row.join(' | ')} |`);
        parts.push([headerRow, alignRow, ...dataRows].join('\n'));
        break;
      }
      case 'image': {
        let safeUrl = block.url;
        if (!isSafeImageUrl(safeUrl)) {
          safeUrl = '';
        }
        const captionPart = block.caption ? ` "${block.caption}"` : '';
        parts.push(`![${block.alt || ''}](${safeUrl}${captionPart})`);
        break;
      }
    }
  }

  return parts.join('\n\n');
}

export function renderInlinesToHtml(text: string): string {
  // Links are resolved first and their opening tag parked behind a placeholder so
  // emphasis/code rules can never rewrite a URL.
  const parked: string[] = [];
  let html = escapeHtml(String(text).replace(/\u0000/g, '')).replace(MD_LINK, (_m, label, url) => {
    // `url` is HTML-escaped text; the safety check decodes entities itself.
    if (!isSafeLinkUrl(url)) return `<span>${label}</span>`;
    // eslint-disable-next-line no-control-regex
    const cleanUrl = String(url).replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
    parked.push(`<a href="${cleanUrl}" rel="noopener noreferrer">`);
    return `\u0000${parked.length - 1}\u0000${label}</a>`;
  });

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return html.replace(/\u0000(\d+)\u0000/g, (_m, i) => parked[Number(i)] ?? '');
}

export function renderMarkdownToHtml(markdown: string): string {
  const doc = parseMarkdown(markdown);
  const htmlParts: string[] = [];

  for (const block of doc.blocks) {
    switch (block.type) {
      case 'heading': {
        const tag = `h${block.level}`;
        htmlParts.push(`<${tag}>${renderInlinesToHtml(block.text)}</${tag}>`);
        break;
      }
      case 'paragraph': {
        htmlParts.push(`<p>${renderInlinesToHtml(block.text)}</p>`);
        break;
      }
      case 'code': {
        htmlParts.push(
          `<pre><code class="language-${escapeHtml(block.language)}">${escapeHtml(block.code)}</code></pre>`
        );
        break;
      }
      case 'divider': {
        htmlParts.push('<hr />');
        break;
      }
      case 'blockquote': {
        htmlParts.push(`<blockquote><p>${renderInlinesToHtml(block.text)}</p></blockquote>`);
        break;
      }
      case 'callout': {
        htmlParts.push(
          `<div class="callout callout-${escapeHtml(block.calloutType)}" role="note"><strong class="callout-title">${escapeHtml(
            block.title || block.calloutType.toUpperCase()
          )}</strong><p>${renderInlinesToHtml(block.text)}</p></div>`
        );
        break;
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const items = block.items.map((i) => `<li>${renderInlinesToHtml(i)}</li>`).join('');
        htmlParts.push(`<${tag}>${items}</${tag}>`);
        break;
      }
      case 'table': {
        const headerCells = block.headers
          .map((h, i) => `<th style="text-align: ${block.alignments[i] || 'left'}">${renderInlinesToHtml(h)}</th>`)
          .join('');
        const rows = block.rows
          .map((row) => {
            const cells = row
              .map((c, i) => `<td style="text-align: ${block.alignments[i] || 'left'}">${renderInlinesToHtml(c)}</td>`)
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
        htmlParts.push(
          `<div class="table-responsive"><table class="rich-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`
        );
        break;
      }
      case 'image': {
        let safeUrl = block.url;
        const zurAssetId = safeUrl.match(/^zur-asset:([0-9a-f-]{36})$/i)?.[1];
        if (!isSafeImageUrl(safeUrl)) {
          safeUrl = '';
        }
        const altAttr = block.isDecorative ? 'alt="" aria-hidden="true"' : `alt="${escapeHtml(block.alt)}"`;
        const captionHtml = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
        const sourceAttr = zurAssetId
          ? `src="about:blank#zur-asset-${escapeHtml(zurAssetId)}" data-authorized-asset="${escapeHtml(zurAssetId)}"`
          : `src="${escapeHtml(safeUrl)}"`;
        if (!zurAssetId && !safeUrl) {
          htmlParts.push(
            `<figure class="rich-image rich-image-blocked"><span>${escapeHtml(block.alt || 'Image unavailable')}</span>${captionHtml}</figure>`
          );
          break;
        }
        const extra = zurAssetId ? '' : ' loading="lazy" referrerpolicy="no-referrer"';
        htmlParts.push(`<figure class="rich-image"><img ${sourceAttr} ${altAttr}${extra} />${captionHtml}</figure>`);
        break;
      }
    }
  }

  return htmlParts.join('\n');
}
