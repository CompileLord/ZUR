import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_HEADLINE, startHeroTyping } from '../src/pages/public/LandingHero.ts';

const els = () => ({ text: { textContent: LANDING_HEADLINE }, cursor: { hidden: true } });

// The headline was painted in full, then cleared when the lazy controller loaded: a visible flash.
test('typing clears the headline at once, then types it out and hides the cursor', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const { text, cursor } = els();
    startHeroTyping(text, cursor, false);
    assert.equal(text.textContent, '');
    assert.equal(cursor.hidden, false);
    mock.timers.tick(45 * LANDING_HEADLINE.length);
    mock.timers.tick(600);
    assert.equal(text.textContent, LANDING_HEADLINE);
    assert.equal(cursor.hidden, true);
  } finally { mock.timers.reset(); }
});

test('finish shows the whole headline immediately; reduced motion never types', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const a = els();
    const finish = startHeroTyping(a.text, a.cursor, false);
    mock.timers.tick(90);
    finish();
    assert.equal(a.text.textContent, LANDING_HEADLINE);
    assert.equal(a.cursor.hidden, true);
    const b = els();
    startHeroTyping(b.text, b.cursor, true);
    assert.equal(b.text.textContent, LANDING_HEADLINE);
  } finally { mock.timers.reset(); }
});
