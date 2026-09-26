import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/S4-M04-visual-matrix.json'), 'utf8'));

function pngDimensions(file: string): [number, number] {
  const header = fs.readFileSync(path.join(root, file)).subarray(0, 24);
  assert.equal(header.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} is a PNG`);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

test('T087 viewport matrix has both themes and real captures at each required CSS size', () => {
  assert.deepEqual(matrix.viewportMatrix.themes, ['dark', 'light']);
  for (const viewport of matrix.viewportMatrix.viewports) {
    for (const theme of matrix.viewportMatrix.themes) {
      for (const template of viewport.files) {
        const file = template.replace('{theme}', theme);
        assert.deepEqual(pngDimensions(file), [viewport.width, viewport.height], file);
      }
    }
  }
});

test('T087 high-DPR reflow proxy declares and matches its verified viewport dimensions', () => {
  for (const file of matrix.viewportMatrix.zoomProxy.files) {
    assert.deepEqual(pngDimensions(file), matrix.viewportMatrix.zoomProxy.physicalDimensions, file);
  }
  assert.deepEqual(matrix.viewportMatrix.zoomProxy.verifiedCssViewport, [320, 900]);
  assert.equal(matrix.viewportMatrix.zoomProxy.deviceScaleFactor, 2);
  assert.match(matrix.viewportMatrix.zoomProxy.method, /Emulation\.setDeviceMetricsOverride sets and verifies innerWidth=320/);
  assert.match(matrix.viewportMatrix.zoomProxy.method, /not actual browser UI zoom or text enlargement/);
});

test('T087 checkpoint gaps are explicit and evidence links resolve', () => {
  assert.equal(matrix.design17Checkpoints.length, 15);
  assert.equal(matrix.requiredAdverseStates.length, 9);
  for (const entry of [...matrix.design17Checkpoints, ...matrix.requiredAdverseStates]) {
    assert.ok(['captured', 'partial', 'unavailable'].includes(entry.coverage), entry.checkpoint ?? entry.state);
    if (entry.coverage !== 'captured') assert.ok(entry.gap?.length, `${entry.checkpoint ?? entry.state} must disclose its gap`);
    for (const file of entry.evidence) assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
  }
});
