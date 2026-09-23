import test from 'node:test';
import assert from 'node:assert';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('WCAG 2.2 AA Contrast Ratios for Canonical Tokens (design.md §3.4, T008)', async (t) => {
  await t.test('Dark Theme Contrast Ratios', () => {
    // Normal reading text on canvas: >= 4.5:1
    const textCanvas = contrastRatio('#F1F3EA', '#141613');
    assert.strictEqual(textCanvas >= 4.5, true, `Text on Canvas contrast: ${textCanvas.toFixed(2)}`);

    // Secondary text on canvas: >= 4.5:1
    const secCanvas = contrastRatio('#BDC3B5', '#141613');
    assert.strictEqual(secCanvas >= 4.5, true, `Secondary on Canvas contrast: ${secCanvas.toFixed(2)}`);

    // Primary button: on-accent on accent: >= 4.5:1
    const buttonContrast = contrastRatio('#1A210D', '#D4E88B');
    assert.strictEqual(buttonContrast >= 4.5, true, `Primary button contrast: ${buttonContrast.toFixed(2)}`);

    // Control border on surface: >= 3.0:1 (WCAG non-text contrast)
    const controlBorder = contrastRatio('#78816F', '#1B1E19');
    assert.strictEqual(controlBorder >= 3.0, true, `Control border contrast: ${controlBorder.toFixed(2)}`);

    // Reading text on surface: >= 4.5:1
    const textSurface = contrastRatio('#F1F3EA', '#1B1E19');
    assert.strictEqual(textSurface >= 4.5, true, `Text on Surface contrast: ${textSurface.toFixed(2)}`);
  });

  await t.test('Light Theme Contrast Ratios', () => {
    // Normal reading text on canvas: >= 4.5:1
    const textCanvas = contrastRatio('#20251C', '#F5F6F0');
    assert.strictEqual(textCanvas >= 4.5, true, `Text on Canvas contrast: ${textCanvas.toFixed(2)}`);

    // Secondary text on canvas: >= 4.5:1
    const secCanvas = contrastRatio('#4E5847', '#F5F6F0');
    assert.strictEqual(secCanvas >= 4.5, true, `Secondary on Canvas contrast: ${secCanvas.toFixed(2)}`);

    // Primary button: on-accent on accent: >= 4.5:1
    const buttonContrast = contrastRatio('#FFFFFF', '#485D18');
    assert.strictEqual(buttonContrast >= 4.5, true, `Primary button contrast: ${buttonContrast.toFixed(2)}`);

    // Control border on surface: >= 3.0:1
    const controlBorder = contrastRatio('#78816F', '#FFFFFF');
    assert.strictEqual(controlBorder >= 3.0, true, `Control border contrast: ${controlBorder.toFixed(2)}`);
  });
});
