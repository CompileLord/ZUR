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

const DANGEROUS_PROTOCOLS = /^(javascript:|vbscript:|data:text\/html)/i;
const DANGEROUS_HTML_TAGS = /<\/?(script|iframe|object|embed|applet|meta|link|base|form|input|button|style)[^>]*>/gi;
const HTML_EVENT_HANDLERS = /\s+on[a-z]+="[^"]*"/gi;
const HTML_EVENT_HANDLERS_SINGLE = /\s+on[a-z]+='[^']*'/gi;
const HTML_EVENT_HANDLERS_UNQUOTED = /\s+on[a-z]+=[^\s>]+/gi;
const INLINE_STYLES = /\s+style="[^"]*"/gi;
const INLINE_STYLES_SINGLE = /\s+style='[^']*'/gi;

export function sanitizeHtml(rawHtml: string): string {
  let clean = rawHtml
    .replace(DANGEROUS_HTML_TAGS, '')
    .replace(HTML_EVENT_HANDLERS, '')
    .replace(HTML_EVENT_HANDLERS_SINGLE, '')
    .replace(HTML_EVENT_HANDLERS_UNQUOTED, '')
    .replace(INLINE_STYLES, '')
    .replace(INLINE_STYLES_SINGLE, '');

  clean = clean.replace(/href\s*=\s*(['"])(.*?)\1/gi, (match, quote, url) => {
    if (DANGEROUS_PROTOCOLS.test(url.trim())) {
      return 'href="#"';
    }
    return match;
  });

  clean = clean.replace(/src\s*=\s*(['"])(.*?)\1/gi, (match, quote, url) => {
    if (DANGEROUS_PROTOCOLS.test(url.trim())) {
      return 'src=""';
    }
    return match;
  });

  clean = clean.replace(/\[(.*?)\]\((.*?)\)/g, (match, label, url) => {
    if (DANGEROUS_PROTOCOLS.test(url.trim())) {
      return `[${label}](#)`;
    }
    return match;
  });

  return clean;
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

      const calloutMatch = bqText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+(.*))?/i);
      if (calloutMatch) {
        const calloutType = calloutMatch[1].toLowerCase() as CalloutType;
        const remaining = bqLines.slice(1).join('\n').trim();
        const customTitle = calloutMatch[2] ? calloutMatch[2].trim() : undefined;
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
      if (DANGEROUS_PROTOCOLS.test(url.trim())) {
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
        if (DANGEROUS_PROTOCOLS.test(safeUrl.trim())) {
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
  let html = escapeHtml(text);

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links: [text](url)
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    if (DANGEROUS_PROTOCOLS.test(url.trim())) {
      return `<span>${label}</span>`;
    }
    return `<a href="${url}" rel="noopener noreferrer">${label}</a>`;
  });

  return html;
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
        if (DANGEROUS_PROTOCOLS.test(safeUrl.trim())) {
          safeUrl = '';
        }
        const altAttr = block.isDecorative ? 'alt="" aria-hidden="true"' : `alt="${escapeHtml(block.alt)}"`;
        const captionHtml = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
        const sourceAttr = zurAssetId
          ? `src="about:blank#zur-asset-${escapeHtml(zurAssetId)}" data-authorized-asset="${escapeHtml(zurAssetId)}"`
          : `src="${escapeHtml(safeUrl)}"`;
        htmlParts.push(`<figure class="rich-image"><img ${sourceAttr} ${altAttr} />${captionHtml}</figure>`);
        break;
      }
    }
  }

  return htmlParts.join('\n');
}
