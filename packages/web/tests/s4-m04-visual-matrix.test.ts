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

test('T087 actual Chrome 200% UI zoom has separately captured browser metrics and evidence', () => {
  const zoom = matrix.viewportMatrix.actualBrowserZoom200;
  assert.match(zoom.method, /chrome:\/\/settings\/appearance.*200%/);
  assert.match(zoom.method, /not CDP viewport, DPR, or page-scale emulation/);
  assert.equal(zoom.metrics.innerWidth * 2, zoom.metrics.outerWidth);
  assert.equal(zoom.metrics.visualViewportScale, 1);
  const [width, height] = pngDimensions(zoom.capture);
  assert.ok(width > 0 && height > 0);
  assert.ok(fs.existsSync(path.join(root, zoom.details)));
});

test('T087 representative journeys have GUI Chrome 200% zoom captures with measured viewport/DPR', () => {
  const file = path.join(root, 'docs/evidence/s4-m04-gui-zoom-captures.json');
  assert.ok(fs.existsSync(file), 'GUI zoom capture report exists');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(report.captures.length, 28);
  assert.match(report.method, /GUI Chrome Appearance Zoom setting selected 200%/);
  assert.match(report.method, /no Emulation\.setDeviceMetricsOverride/);
  assert.equal(matrix.viewportMatrix.representativeBrowserZoom200.captureCount, report.captures.length);
  assert.deepEqual(
    [...new Set(report.captures.map((item: any) => item.id))].sort(),
    [...matrix.viewportMatrix.representativeBrowserZoom200.journeys].sort(),
  );
  const p22Zoom = report.captures.filter((item: any) => item.id === 's4_t087_p22_builder_deep_tree_long_titles');
  assert.deepEqual(p22Zoom.map((item: any) => item.theme).sort(), ['dark', 'light']);
  assert.ok(p22Zoom.every((item: any) => item.browserZoomPercent === 200));
  for (const item of report.captures) {
    assert.equal(item.browserZoomPercent, 200, item.id);
    assert.equal(item.actual.innerWidth * 2, item.baseline.innerWidth, `${item.id} ${item.theme} CSS width`);
    assert.ok(Math.abs(item.actual.innerHeight * 2 - item.baseline.innerHeight) <= 1, `${item.id} ${item.theme} CSS height`);
    assert.equal(item.actual.outerWidth, item.baseline.outerWidth, `${item.id} ${item.theme} window width`);
    assert.equal(item.actual.outerHeight, item.baseline.outerHeight, `${item.id} ${item.theme} window height`);
    assert.equal(item.actual.devicePixelRatio, item.baseline.devicePixelRatio * 2, `${item.id} ${item.theme} DPR`);
    assert.equal(item.actual.visualViewportScale, 1, `${item.id} ${item.theme} is browser zoom, not pinch zoom`);
    assert.ok(item.actual.innerHeight > 0 && item.actual.outerHeight > 0, `${item.id} ${item.theme} height metrics`);
    const [width, height] = pngDimensions(item.screenshot);
    assert.ok(width > 0 && height > 0, item.screenshot);
  }
});

test('T087 P28 roster header and filters fit the 320px and 390px viewports in both themes', () => {
  const file = path.join(root, 'docs/evidence/s4-m04-roster-layout-checks.json');
  assert.ok(fs.existsSync(file), 'P28 responsive layout measurements exist');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(report.captures.length, 4);
  assert.deepEqual(
    report.captures.map((item: any) => [item.width, item.theme]).sort((a: any[], b: any[]) => a[0] - b[0] || a[1].localeCompare(b[1])),
    [[320, 'dark'], [320, 'light'], [390, 'dark'], [390, 'light']],
  );
  for (const item of report.captures) {
    assert.equal(item.height, 844);
    assert.ok(item.documentWidth <= item.documentClientWidth, `${item.name}: no page-level horizontal overflow`);
    assert.ok(item.headerActionTop >= item.headerTitleBottom, `${item.name}: invite action follows the title/description`);
    assert.ok(item.headerActionRight <= item.headerRight + 1, `${item.name}: invite action remains within its header`);
    assert.ok(item.toolbarScrollWidth <= item.toolbarWidth + 1, `${item.name}: filter toolbar has no overflow`);
    assert.ok(item.controls.every((control: any) => control.left >= 0 && control.right <= item.width + 1), `${item.name}: filter control fits viewport`);
    assert.deepEqual(pngDimensions(`screenshots/${item.name}.png`), [item.width, item.height], item.name);
  }
});

test('T087 real P15/P27 browser flows have authenticated API and screenshot evidence', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/s4-m04-interactive-browser-flows.json'), 'utf8'));
  const p15 = report.liveRouteProbes.P15;
  assert.equal(p15.captures.length, 5);
  assert.deepEqual([...new Set(p15.captures.map((item: any) => item.theme))].sort(), ['dark', 'light']);
  assert.ok(p15.apiResponses.some((item: any) => item.url.endsWith('/api/execution/run-samples') && item.status === 200));
  assert.ok(p15.apiResponses.some((item: any) => item.url.endsWith('/api/execution/submit') && item.status === 200));
  for (const state of p15.states) {
    assert.match(state.sampleText, /Samples passed/);
    assert.match(state.submitText, /did not pass a hidden test/);
    assert.equal(state.safeHiddenResult.containsSecretInput, false);
    assert.equal(state.safeHiddenResult.containsHiddenExpectedOutput, false);
    assert.equal(state.safeHiddenResult.containsExecutionTiming, false);
    assert.equal(state.safeHiddenResult.continueVisible, false);
  }
  assert.equal(p15.staleReset.conflictResponse.status, 409);
  assert.equal(p15.staleReset.localCodePreserved, true);
  const p27 = report.liveRouteProbes.P27;
  assert.ok(p27.initialApiResponses.some((item: any) => item.url.endsWith('/validate') && item.status === 200));
  assert.ok(p27.captures.some((item: any) => item.state === 'explicit confirmation dialog' && item.theme === 'dark'));
  assert.ok(p27.captures.some((item: any) => item.state === 'explicit confirmation dialog' && item.theme === 'light'));
  const receipt = p27.captures.find((item: any) => item.state === 'server-issued receipt after confirmation');
  assert.equal(receipt.publishResponse.status, 200);
  assert.match(receipt.receiptText, /Released Version/);
  for (const item of [...p15.captures, ...p27.captures]) {
    assert.deepEqual(pngDimensions(item.screenshot), [1440, 900], item.screenshot);
  }
  const p16 = report.liveRouteProbes.P16;
  assert.match(p16.result, /registered authenticated history route/);
  assert.equal(p16.listHasTiming, false);
  assert.equal(p16.detailHasTiming, false);
  assert.equal(p16.listUiHasTiming, false);
  assert.equal(p16.detailUiHasTiming, false);
  assert.equal(p16.captures.length, 2);
  for (const item of p16.captures) assert.deepEqual(pngDimensions(item.screenshot), [1440, 900], item.screenshot);
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

test('T087 expanded journey captures resolve at their declared themes and CSS viewports', () => {
  assert.equal(matrix.expandedJourneys.cases.length, 32);
  for (const journey of matrix.expandedJourneys.cases) {
    assert.deepEqual(journey.themes, ['dark', 'light'], journey.id);
    assert.deepEqual(journey.viewports, [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 844]], journey.id);
    for (const [width, height] of journey.viewports) {
      for (const theme of journey.themes) {
        const file = `screenshots/${journey.prefix}_${width}x${height}_${theme}.png`;
        assert.deepEqual(pngDimensions(file), [width, height], `${journey.id}: ${file}`);
      }
    }
  }
});

test('T087 P29 detail has responsive browser bounds evidence at every required viewport and theme', () => {
  const reportPath = path.join(root, 'docs/evidence/s4-m04-student-detail-layout-checks.json');
  assert.ok(fs.existsSync(reportPath), 'P29 layout measurements exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.captures.length, 10);
  const expected = new Set(['1440x900', '1024x768', '768x1024', '390x844', '320x844']);
  for (const theme of ['dark', 'light']) {
    const captures = report.captures.filter((item: any) => item.theme === theme);
    assert.equal(captures.length, 5, `${theme} P29 capture count`);
    assert.deepEqual(new Set(captures.map((item: any) => `${item.width}x${item.height}`)), expected, `${theme} P29 viewports`);
    for (const item of captures) {
      assert.ok(item.documentWidth <= item.documentClientWidth, `${item.name}: document has no horizontal overflow`);
      assert.ok(item.heroRight <= item.width + 1, `${item.name}: hero fits viewport`);
      assert.ok(item.actionsRight <= item.width + 1, `${item.name}: actions fit viewport`);
      assert.equal(item.progressSummary, '3 of 8 completed (38%)', `${item.name}: displayed progress summary`);
      assert.equal(item.completedStepLabels, 3, `${item.name}: completed curriculum rows`);
      assert.equal(item.notStartedStepLabels, 5, `${item.name}: not-started curriculum rows`);
    }
  }
  const zoomReport = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/s4-m04-gui-zoom-captures.json'), 'utf8'));
  assert.equal(zoomReport.captures.filter((item: any) => item.id === 's4_t087_p29_student_detail').length, 2);
});

test('T087 admin waiver review screenshots come from the authenticated client/API flow', () => {
  const file = path.join(root, 'docs/evidence/s4-m04-interactive-browser-flows.json');
  assert.ok(fs.existsSync(file), 'interactive browser flow report exists');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(report.method, /real sign-in form/);
  assert.match(report.method, /authenticated GET preview API/);
  assert.match(report.notCaptured, /waiver was not applied/);
  assert.equal(report.apiPreviewStatus, 200);
  assert.equal(report.captures.length, 2);
  for (const capture of report.captures) {
    assert.deepEqual(capture.viewport, [1440, 900]);
    assert.equal(capture.authenticatedRequestStatus, 200);
    assert.equal(capture.buttonEnabled, true);
    assert.match(capture.reviewText, /^1 active enrollment\(s\) will be affected/);
    assert.deepEqual(pngDimensions(capture.screenshot), [1440, 900]);
  }
  const p22 = report.liveRouteProbes.P22;
  assert.match(p22.result, /open-inspector visual checkpoint/);
  assert.match(p22.result, /visibility controls were not exercised/);
  assert.equal(p22.captures.length, 2);
  for (const capture of p22.captures) {
    assert.equal(capture.inspectorLabel, 'Step Settings');
    assert.deepEqual(pngDimensions(capture.screenshot), [1440, 900]);
  }
  assert.equal(report.liveRouteProbes.P27.containsPublicationReviewComponent, true);
  assert.ok(report.liveRouteProbes.P27.captures.some((capture: any) => capture.state === 'server-issued receipt after confirmation'));
  const p15 = report.liveRouteProbes.P15;
  assert.equal(p15.captures.length, 5);
  assert.ok(p15.apiResponses.some((item: any) => item.url.endsWith('/api/execution/run-samples') && item.status === 200));
  assert.ok(p15.apiResponses.some((item: any) => item.url.endsWith('/api/execution/submit') && item.status === 200));
});
