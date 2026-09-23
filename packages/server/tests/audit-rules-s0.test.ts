import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (file === 'node_modules' || file === 'dist' || file === '.git' || file === 'data') {
      continue;
    }
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.css') || file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

test('Audit: rules_strictly.md code quality invariants', () => {
  const allFiles = getAllFiles(join(process.cwd(), 'packages'));
  assert.ok(allFiles.length > 15, 'Found expected codebase files');

  // Rule: Few code comments, no stale TODOs
  for (const file of allFiles) {
    if (file.endsWith('.test.ts')) continue;
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      !content.includes('TODO:') && !content.includes('FIXME:'),
      `File ${file} should not contain unresolved TODOs or FIXMEs`
    );
  }

  // Rule: P0 scope protection - No P1/P2 social logins or fake AI controls
  for (const file of allFiles) {
    if (file.endsWith('audit-rules-s0.test.ts')) continue;
    const content = readFileSync(file, 'utf-8').toLowerCase();
    assert.ok(!content.includes('google-login') && !content.includes('oauth-provider'), `File ${file} must not contain P1 social login implementation`);
    assert.ok(!content.includes('ai-assistant-widget') && !content.includes('copilot-prompt'), `File ${file} must not contain P1 AI widgets`);
  }
});

test('Audit: rules_strictly.md CSS tokens and no Tailwind classes', () => {
  const webFiles = getAllFiles(join(process.cwd(), 'packages/web'));
  for (const file of webFiles) {
    if (file.endsWith('.css') || file.endsWith('.html') || file.endsWith('.ts')) {
      const content = readFileSync(file, 'utf-8');
      // Verify no Tailwind utility classes like 'bg-red-500', 'text-sm', 'flex-col' used as Tailwind markup
      assert.ok(!content.includes('@tailwind'), `File ${file} must not use Tailwind directive`);
      assert.ok(!content.includes('text-slate-'), `File ${file} must not use Tailwind slate colors`);
      assert.ok(!content.includes('bg-emerald-'), `File ${file} must not use Tailwind emerald colors`);
    }
  }
});

test('Audit: tasks.json Stage S0 completion status', () => {
  const tasksRaw = readFileSync(join(process.cwd(), 'tasks.json'), 'utf-8');
  const tasksData = JSON.parse(tasksRaw);
  
  const stageS0 = tasksData.stages.find((s: any) => s.id === 'S0');
  assert.ok(stageS0, 'Stage S0 must exist');
  assert.equal(stageS0.status, 'done', 'Stage S0 must be marked done');

  for (const module of stageS0.modules) {
    assert.equal(module.status, 'done', `Module ${module.id} must be marked done`);
    for (const task of module.tasks) {
      assert.equal(task.status, 'done', `Task ${task.id} must be marked done`);
      assert.ok(Array.isArray(task.evidence) && task.evidence.length > 0, `Task ${task.id} must provide concrete evidence`);
    }
  }
});

test('Audit: tasks.json Module S1-M01 completion status and evidence files', () => {
  const tasksRaw = readFileSync(join(process.cwd(), 'tasks.json'), 'utf-8');
  const tasksData = JSON.parse(tasksRaw);

  const stageS1 = tasksData.stages.find((s: any) => s.id === 'S1');
  assert.ok(stageS1, 'Stage S1 must exist');
  assert.equal(stageS1.status, 'done', 'Stage S1 must be marked done');

  const moduleM01 = stageS1.modules.find((m: any) => m.id === 'S1-M01');
  assert.ok(moduleM01, 'Module S1-M01 must exist');
  assert.equal(moduleM01.status, 'done', 'Module S1-M01 must be marked done');

  const requiredTasks = ['T013', 'T014', 'T015', 'T016', 'T017', 'T018'];
  for (const taskId of requiredTasks) {
    const task = moduleM01.tasks.find((t: any) => t.id === taskId);
    assert.ok(task, `Task ${taskId} must exist in S1-M01`);
    assert.equal(task.status, 'done', `Task ${taskId} must be marked done`);
    assert.ok(Array.isArray(task.evidence) && task.evidence.length > 0, `Task ${taskId} must have evidence array`);

    for (const fileRel of task.evidence) {
      const fullPath = join(process.cwd(), fileRel);
      assert.ok(statSync(fullPath).isFile(), `Evidence file ${fileRel} must exist`);
    }
  }
});

test('Audit: tasks.json Module S1-M02 completion status and evidence files', () => {
  const tasksRaw = readFileSync(join(process.cwd(), 'tasks.json'), 'utf-8');
  const tasksData = JSON.parse(tasksRaw);

  const stageS1 = tasksData.stages.find((s: any) => s.id === 'S1');
  assert.ok(stageS1, 'Stage S1 must exist');

  const moduleM02 = stageS1.modules.find((m: any) => m.id === 'S1-M02');
  assert.ok(moduleM02, 'Module S1-M02 must exist');
  assert.equal(moduleM02.status, 'done', 'Module S1-M02 must be marked done');

  const requiredTasks = ['T019', 'T020', 'T021', 'T022', 'T023', 'T024', 'T025', 'T026', 'T027', 'T028'];
  for (const taskId of requiredTasks) {
    const task = moduleM02.tasks.find((t: any) => t.id === taskId);
    assert.ok(task, `Task ${taskId} must exist in S1-M02`);
    assert.equal(task.status, 'done', `Task ${taskId} must be marked done`);
    assert.ok(Array.isArray(task.evidence) && task.evidence.length > 0, `Task ${taskId} must have evidence array`);

    for (const fileRel of task.evidence) {
      const fullPath = join(process.cwd(), fileRel);
      assert.ok(statSync(fullPath).isFile(), `Evidence file ${fileRel} must exist`);
    }
  }
});

