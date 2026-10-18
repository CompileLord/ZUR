import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseThumbColors, COURSE_THUMB_HUES, renderCourseThumb } from '../src/utils/course-thumb.ts';

test('course thumb colors are deterministic and within the palette', () => {
  for (const id of ['a', 'course-1', 'Zeta Python', '', '日本語']) {
    const a = courseThumbColors(id);
    assert.deepEqual(a, courseThumbColors(id));
    assert.ok(COURSE_THUMB_HUES.includes(a.hue));
  }
  const hues = new Set(Array.from({ length: 60 }, (_, i) => courseThumbColors('c' + i).hue));
  assert.ok(hues.size >= 5);
});

test('renderCourseThumb escapes and uses the shared gradient', () => {
  const html = renderCourseThumb({ seed: 'x', title: '<b>T', className: 'k', href: '/a"b' });
  assert.ok(html.includes('linear-gradient'));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&quot;'));
});
