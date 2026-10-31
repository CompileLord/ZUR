import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownToHtml } from '../src/markdown.ts';

test('inline code keeps angle brackets as visible text', () => {
  const html = renderMarkdownToHtml("Compare `if a<b and c>d:` and `<class 'int'>` with `List<int>`.");
  assert.ok(html.includes('if a&lt;b and c&gt;d:'), html);
  assert.ok(html.includes('&lt;class &#39;int&#39;&gt;'), html);
  assert.ok(html.includes('List&lt;int&gt;'), html);
});

test('raw HTML outside inline code is still removed, and HTML inside code never becomes markup', () => {
  const html = renderMarkdownToHtml('Text <img src=x onerror=alert(1)> and `<img src=x onerror=alert(1)>`');
  assert.equal(/<img/i.test(html), false, html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), html);
});
