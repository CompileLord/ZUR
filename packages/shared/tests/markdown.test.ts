import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkdown,
  serializeMarkdown,
  sanitizeMarkdown,
  sanitizeHtml,
  renderMarkdownToHtml,
} from '../src/markdown.ts';

test('Markdown AST, Sanitization & Round-Trip (T032, MCP-03)', async (t) => {
  await t.test('Parses GFM headings, paragraphs, lists, code fences, and tables', () => {
    const md = [
      '# Introduction to Python',
      '',
      'Python is a readable, interpreted language.',
      '',
      '```python',
      'def greet(name):',
      '    return f"Hello, {name}!"',
      '```',
      '',
      '## Key Features',
      '',
      '- Dynamic typing',
      '- Clean syntax',
      '- Rich standard library',
      '',
      '| Operator | Description | Precedence |',
      '|:---|:---:|---:|',
      '| `+` | Addition | 10 |',
      '| `*` | Multiplication | 20 |',
      '',
      '---',
      '',
      '> [!NOTE]',
      '> Python 3 is the authoritative version taught on ZUR.',
    ].join('\n');

    const doc = parseMarkdown(md);
    assert.equal(doc.blocks.length, 8);

    assert.equal(doc.blocks[0].type, 'heading');
    assert.equal((doc.blocks[0] as any).level, 1);
    assert.equal((doc.blocks[0] as any).text, 'Introduction to Python');

    assert.equal(doc.blocks[1].type, 'paragraph');

    assert.equal(doc.blocks[2].type, 'code');
    assert.equal((doc.blocks[2] as any).language, 'python');
    assert.ok((doc.blocks[2] as any).code.includes('def greet(name):'));

    assert.equal(doc.blocks[3].type, 'heading');
    assert.equal((doc.blocks[3] as any).level, 2);

    assert.equal(doc.blocks[4].type, 'list');
    assert.equal((doc.blocks[4] as any).items.length, 3);

    assert.equal(doc.blocks[5].type, 'table');
    assert.equal((doc.blocks[5] as any).headers.length, 3);
    assert.equal((doc.blocks[5] as any).rows.length, 2);

    assert.equal(doc.blocks[6].type, 'divider');

    assert.equal(doc.blocks[7].type, 'callout');
    assert.equal((doc.blocks[7] as any).calloutType, 'note');
  });

  await t.test('Round-trip serialization preserves canonical AST blocks', () => {
    const original = [
      '## Variables and Types',
      '',
      'A variable stores data.',
      '',
      '```python',
      'x = 42',
      '```',
      '',
      '- int',
      '- float',
      '- str',
    ].join('\n');

    const doc = parseMarkdown(original);
    const serialized = serializeMarkdown(doc);
    const doc2 = parseMarkdown(serialized);

    assert.equal(doc.blocks.length, doc2.blocks.length);
    assert.deepEqual(doc.blocks, doc2.blocks);
  });

  await t.test('Sanitizes dangerous HTML: strips scripts, iframes, and javascript URIs', () => {
    const malicious = [
      '# Safe Title <script>alert("xss")</script>',
      '',
      '<iframe src="https://evil.com"></iframe>',
      '',
      'Click here: [Harmful Link](javascript:alert("pwned"))',
      '',
      '<div onclick="doBadThings()" style="color: red">Some text</div>',
      '',
      '![XSS image](javascript:void(0))',
    ].join('\n');

    const sanitized = sanitizeMarkdown(malicious);
    assert.ok(!sanitized.includes('<script>'), 'Must strip script tags');
    assert.ok(!sanitized.includes('<iframe>'), 'Must strip iframe tags');
    assert.ok(!sanitized.includes('javascript:'), 'Must strip javascript: protocol');
    assert.ok(!sanitized.includes('onclick'), 'Must strip event handlers');
    assert.ok(!sanitized.includes('style="'), 'Must strip inline styles');

    const html = renderMarkdownToHtml(malicious);
    assert.ok(!html.includes('<script>'), 'Rendered HTML must not contain script tags');
    assert.ok(!html.includes('<iframe>'), 'Rendered HTML must not contain iframe tags');
    assert.ok(!html.includes('href="javascript:'), 'Rendered HTML must not contain javascript hrefs');
  });

  await t.test('Renders safe HTML with semantic tags and WCAG structure', () => {
    const md = [
      '# Main Heading',
      '',
      'This is **bold**, *italic*, and `code`.',
      '',
      '![Diagram of loop](/images/loop.png "A diagram illustrating while loops")',
    ].join('\n');

    const html = renderMarkdownToHtml(md);
    assert.ok(html.includes('<h1>Main Heading</h1>'));
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<em>italic</em>'));
    assert.ok(html.includes('<code>code</code>'));
    assert.ok(html.includes('<img src="/images/loop.png" alt="Diagram of loop"'));
    assert.ok(html.includes('<figcaption>A diagram illustrating while loops</figcaption>'));
  });
});
