import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = fs.existsSync(path.join(process.cwd(), 'screenshots'))
  ? process.cwd()
  : path.resolve(process.cwd(), '../..');

function pngDimensions(file: string): [number, number] {
  const fullPath = path.join(root, file);
  assert.ok(fs.existsSync(fullPath), `Expected screenshot exists: ${file}`);
  const header = fs.readFileSync(fullPath).subarray(0, 24);
  assert.equal(header.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} is a valid PNG`);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

test('Desktop visual evidence: verified 1440x900 resolution in dark and light themes', () => {
  const evidencePath = path.join(root, 'screenshots', 'evidence.json');
  assert.ok(fs.existsSync(evidencePath), 'evidence.json must exist');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  // 1. Overall run status and flags
  assert.equal(evidence.status, 'passed', 'evidence.status must be passed');
  assert.equal(evidence.blockedExecution, false, 'evidence.blockedExecution must be false');
  assert.ok(typeof evidence.runId === 'string' && evidence.runId.trim().length > 0, 'runId must be a non-empty string');

  // 2. Valid timestamps within run
  assert.ok(typeof evidence.startedAt === 'string' && !isNaN(Date.parse(evidence.startedAt)), 'startedAt must be a valid ISO date');
  assert.ok(typeof evidence.completedAt === 'string' && !isNaN(Date.parse(evidence.completedAt)), 'completedAt must be a valid ISO date');
  const startTime = Date.parse(evidence.startedAt);
  const completeTime = Date.parse(evidence.completedAt);
  assert.ok(completeTime >= startTime, 'completedAt must be greater than or equal to startedAt');

  // 3. All 8 unique journey IDs 0..7 passed and no error
  assert.ok(Array.isArray(evidence.journeys), 'evidence.journeys must be an array');
  assert.equal(evidence.journeys.length, 8, 'must contain exactly 8 journeys');
  const seenJourneyIds = new Set<number>();
  for (let id = 0; id <= 7; id++) {
    const journey = evidence.journeys.find((j: any) => j.id === id);
    assert.ok(journey, `Journey ${id} must exist in evidence.journeys`);
    assert.equal(journey.status, 'passed', `Journey ${id} status must be passed`);
    assert.ok(!journey.error, `Journey ${id} must have no error`);
    seenJourneyIds.add(id);
  }
  assert.equal(seenJourneyIds.size, 8, 'All 8 unique journey IDs 0..7 must be present');

  // 4. Expected 18 screens for 9 views both dark/light listed in CURRENT checkpoints
  const expectedScreens = [
    'desktop_catalog_spanish_dark.png',
    'desktop_catalog_spanish_light.png',
    'desktop_author_reorder_dark.png',
    'desktop_author_reorder_light.png',
    'desktop_attempt_history_dark.png',
    'desktop_attempt_history_light.png',
    'desktop_attempt_detail_dark.png',
    'desktop_attempt_detail_light.png',
    'desktop_workspace_dark.png',
    'desktop_workspace_light.png',
    'desktop_account_deletion_pending_dark.png',
    'desktop_account_deletion_pending_light.png',
    'desktop_admin_execution_dark.png',
    'desktop_admin_execution_light.png',
    'desktop_admin_reports_dark.png',
    'desktop_admin_reports_light.png',
    'desktop_admin_media_dark.png',
    'desktop_admin_media_light.png',
  ];

  assert.ok(Array.isArray(evidence.checkpoints), 'evidence.checkpoints must be an array');
  assert.equal(evidence.checkpoints.length, expectedScreens.length, `evidence.checkpoints must contain exactly ${expectedScreens.length} checkpoints`);

  for (const screen of expectedScreens) {
    const cp = evidence.checkpoints.find((c: any) => c.name === screen);
    assert.ok(cp, `Checkpoint for ${screen} must be listed in evidence.checkpoints`);
    assert.ok(!cp.error, `Checkpoint ${screen} must not have recorded an error`);

    // Metadata assertions: actualDataTheme === theme and viewport 1440x900
    assert.ok(cp.theme === 'dark' || cp.theme === 'light', `Checkpoint ${screen} theme must be dark or light`);
    assert.equal(cp.actualDataTheme, cp.theme, `Checkpoint ${screen} actualDataTheme must match theme`);
    assert.deepEqual(cp.viewport, { width: 1440, height: 900 }, `Checkpoint ${screen} viewport must be 1440x900`);

    // Timestamp within run
    assert.ok(typeof cp.timestamp === 'string' && !isNaN(Date.parse(cp.timestamp)), `Checkpoint ${screen} timestamp must be a valid ISO date`);
    const cpTime = Date.parse(cp.timestamp);
    assert.ok(cpTime >= startTime && cpTime <= completeTime, `Checkpoint ${screen} timestamp must be within run interval`);

    // PNG dimensions on disk
    const file = `screenshots/${screen}`;
    assert.deepEqual(
      pngDimensions(file),
      [1440, 900],
      `Desktop capture ${file} must match 1440x900 resolution`
    );
  }
});
