import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownToHtml, renderInlinesToHtml, sanitizeHtml, sanitizeMarkdown, isSafeLinkUrl, isSafeImageUrl } from '../src/markdown.ts';

/** Returns every href/src attribute value in rendered output. */
function urlAttrs(html: string): string[] {
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
}
function assertNoExecutable(html: string, label: string) {
  for (const u of urlAttrs(html)) {
    // Browsers strip these characters inside URLs before choosing a scheme.
    // eslint-disable-next-line no-control-regex
    const n = u.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
    assert.ok(!/^(javascript|vbscript|data|file|blob):/.test(n), `${label}: executable URL ${JSON.stringify(u)} in ${html}`);
    assert.ok(!n.startsWith('//'), `${label}: protocol-relative URL in ${html}`);
  }
  assert.ok(!/<(script|iframe|svg|math|object|embed|style|form|meta|link)\b/i.test(html), `${label}: dangerous tag in ${html}`);
  assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(html), `${label}: handler attribute in ${html}`);
}

const LINK_PAYLOADS: string[] = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java\rscript:alert(1)',
  'java\u0000script:alert(1)',
  '\u0001javascript:alert(1)',
  '  javascript:alert(1)',
  ' javascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'jav&#9;ascript:alert(1)',
  'jav&Tab;ascript:alert(1)',
  'jav&NewLine;ascript:alert(1)',
  '&#106;avascript:alert(1)',
  '&#x6A;avascript:alert(1)',
  'javascript&colon;alert(1)',
  'javascript&#58;alert(1)',
  'javascript%3Aalert(1)',
  '%6Aavascript:alert(1)',
  'vbscript:msgbox(1)',
  'VBScript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:image/svg+xml,<svg onload=alert(1)>',
  '//evil.example/x',
  '///evil.example/x',
  '/\\evil.example/x',
  '\\\\evil.example/x',
  'file:///etc/passwd',
  'blob:https://x/uuid',
  'ftp://evil/x',
  'about:blank#x',
  'jar:https://x!/y',
  'java script:alert(1)',
  'java​script:alert(1)',
];

test('Link scheme allowlist rejects every executable/obfuscated payload', async (t) => {
  for (const p of LINK_PAYLOADS) {
    await t.test(`link payload ${JSON.stringify(p)}`, () => {
      assert.equal(isSafeLinkUrl(p), false, 'must be classified unsafe');
      assertNoExecutable(renderMarkdownToHtml(`[click](${p})`), 'link');
      assertNoExecutable(renderInlinesToHtml(`x [click](${p}) y`), 'inline link');
      assertNoExecutable(
        renderMarkdownToHtml(`- [click](${p})\n\n> [click](${p})\n\n| a |\n|---|\n| [click](${p}) |`),
        'nested'
      );
    });
  }
});

test('The exact lead-verified tab payload no longer yields a link', () => {
  const html = renderMarkdownToHtml('[a](java\tscript:alert(1))');
  assert.ok(!html.includes('<a '), html);
});

test('Image sources: only zur-asset and same-origin paths; external and scheme payloads are dropped', async (t) => {
  const bad = [
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'https://tracker.example/pixel.png',
    'http://tracker.example/pixel.png',
    '//tracker.example/p.png',
    'vbscript:x',
    'file:///etc/passwd',
  ];
  for (const b of bad) {
    await t.test(`image ${JSON.stringify(b)}`, () => {
      const html = renderMarkdownToHtml(`![alt](${b})`);
      assert.ok(!html.includes('<img'), html);
      assertNoExecutable(html, 'image');
    });
  }
  const id = '12345678-1234-4234-8234-123456789abc';
  assert.ok(renderMarkdownToHtml(`![d](zur-asset:${id})`).includes(`data-authorized-asset="${id}"`));
  assert.ok(renderMarkdownToHtml('![d](/images/a.png "cap")').includes('<img src="/images/a.png" alt="d"'));
  assert.equal(isSafeImageUrl('https://example.com/a.png'), false);
});

test('Raw HTML and event handlers never survive, in any quoting style', async (t) => {
  const payloads = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//evil/x.js></SCRIPT>',
    '<img src=x onerror=alert(1)>',
    '<img src="x" onerror="alert(1)">',
    "<img src='x' onerror='alert(1)'>",
    '<img/src=x/onerror=alert(1)>',
    '<IMG SRC=x ONERROR = alert(1)>',
    '<img src=x\nonerror=alert(1)>',
    '<img src=x onerror=alert(1)',
    '<svg onload=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<svg/onload=alert(1)>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<iframe srcdoc="<script>alert(1)</script>">',
    '<body onload=alert(1)>',
    '<details open ontoggle=alert(1)>',
    '<style>@import "https://evil/x.css";</style>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<!--<img src="--><img src=x onerror=alert(1)//">',
    '<form action=javascript:alert(1)><input type=submit>',
    '<object data="data:text/html,<script>alert(1)</script>">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<base href="javascript:alert(1)//">',
    '<<script>alert(1);//<</script>',
  ];
  for (const p of payloads) {
    await t.test(`raw ${JSON.stringify(p)}`, () => {
      for (const md of [p, `# ${p}`, `- ${p}`, `> ${p}`, `> [!NOTE]\n> ${p}`, `| h |\n|---|\n| ${p} |`, `text ${p} text`]) {
        assertNoExecutable(renderMarkdownToHtml(md), 'render');
        const sanitized = sanitizeMarkdown(md);
        assert.ok(!/<\s*(script|iframe|svg|math|style|object|form|meta|base)/i.test(sanitized), `sanitizeMarkdown left a tag: ${sanitized}`);
        assert.ok(!/<[a-z!][^>]*\bon[a-z]+\s*=/i.test(sanitizeHtml(md)), `sanitizeHtml left a handler: ${sanitizeHtml(md)}`);
      }
    });
  }
});

test('Unbalanced / nested brackets and parentheses stay inert', () => {
  const cases = [
    '[a](javascript:alert(1))',
    '[[a](javascript:alert(1))](https://ok.example)',
    '[a]((javascript:alert(1)))',
    '[a](https://ok.example/x)(javascript:alert(1))',
    '[a](https://ok.example "x" onmouseover="alert(1)")',
    '[a](https://ok.example/"onmouseover="alert(1))',
    "[a](https://ok.example/'onmouseover='alert(1))",
    '[a](',
    '[a]()',
    '[](javascript:alert(1))',
    '](javascript:alert(1))[',
    '[a](https://ok.example/<img src=x onerror=alert(1)>)',
    '**[a](javascript:alert(1))**',
    '*[a](java\tscript:alert(1))*',
    '`[a](javascript:alert(1))`',
  ];
  for (const c of cases) assertNoExecutable(renderMarkdownToHtml(c), c);
});

test('Emphasis markers inside a URL do not rewrite it, and quotes cannot break the attribute', () => {
  const html = renderMarkdownToHtml('[a](https://ok.example/**b**)');
  assert.ok(html.includes('href="https://ok.example/**b**"'), html);
  const q = renderMarkdownToHtml('[a](https://ok.example/"onmouseover="alert(1))');
  assert.ok(!/<a [^>]*\sonmouseover=/.test(q), q);
});

test('Very long / pathological inputs finish quickly (ReDoS guard)', async (t) => {
  const n = 200_000;
  const inputs: Record<string, string> = {
    'open brackets': '['.repeat(n),
    'open brackets+parens': '[a]('.repeat(n / 4),
    stars: '*'.repeat(n),
    'star words': '*a '.repeat(n / 3),
    backticks: '`'.repeat(n),
    tildes: '~~a'.repeat(n / 3),
    lt: '<'.repeat(n),
    'tag open': '<a ' + 'x=" '.repeat(n / 4),
    'comment open': '<!--'.repeat(n / 4),
    amp: '&#x'.repeat(n / 3),
    'long url': `[a](https://ok.example/${'a'.repeat(n)})`,
    'long url parens': `[a](${'('.repeat(n)}`,
    image: `![a](${'x'.repeat(n)}`,
    'table cells': `| ${'a | '.repeat(n / 4)}`,
    percent: `[a](${'%'.repeat(n)})`,
  };
  for (const [name, input] of Object.entries(inputs)) {
    await t.test(name, () => {
      const start = performance.now();
      const html = renderMarkdownToHtml(input);
      sanitizeMarkdown(input);
      const ms = performance.now() - start;
      assert.ok(ms < 1500, `${name} took ${ms.toFixed(0)}ms`);
      assertNoExecutable(html, name);
    });
  }
});

test('Legitimate markdown renders as before', () => {
  const md = [
    '# Title',
    '',
    'See [docs](https://docs.python.org/3/) and [mail](mailto:a@b.co) and [rel](/courses/x?y=1#z) and [frag](#top).',
    '',
    'Wiki [link](https://en.wikipedia.org/wiki/Python_(programming_language)) end.',
    '',
    '**bold** *it* ~~del~~ `code`',
    '',
    '| A | B |',
    '|:--|--:|',
    '| 1 | 2 |',
    '',
    '```python',
    'print("<b>&</b>")',
    '```',
    '',
    '> [!TIP] Hint',
    '> Use `x`.',
    '',
    '![Pic](zur-asset:12345678-1234-4234-8234-123456789abc "Caption")',
  ].join('\n');
  const html = renderMarkdownToHtml(md);
  assert.ok(html.includes('<h1>Title</h1>'));
  assert.ok(html.includes('<a href="https://docs.python.org/3/" rel="noopener noreferrer">docs</a>'));
  assert.ok(html.includes('<a href="mailto:a@b.co" rel="noopener noreferrer">mail</a>'));
  assert.ok(html.includes('<a href="/courses/x?y=1#z" rel="noopener noreferrer">rel</a>'));
  assert.ok(html.includes('<a href="#top" rel="noopener noreferrer">frag</a>'));
  assert.ok(html.includes('href="https://en.wikipedia.org/wiki/Python_(programming_language)"'), html);
  assert.ok(html.includes('<strong>bold</strong> <em>it</em> <del>del</del> <code>code</code>'));
  assert.ok(html.includes('<th style="text-align: left">A</th><th style="text-align: right">B</th>'));
  assert.ok(html.includes('<pre><code class="language-python">print(&quot;&lt;b&gt;&amp;&lt;/b&gt;&quot;)</code></pre>'));
  assert.ok(html.includes('class="callout callout-tip" role="note"><strong class="callout-title">Hint</strong>'));
  assert.ok(html.includes('data-authorized-asset="12345678-1234-4234-8234-123456789abc"'));
  assert.ok(html.includes('<figcaption>Caption</figcaption>'));
});

test('Code fences keep literal HTML as escaped text', () => {
  const html = renderMarkdownToHtml('```html\n<script>alert(1)</script>\n```');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script'));
});
