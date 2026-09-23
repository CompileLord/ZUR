import test from 'node:test';
import assert from 'node:assert';
import {
  renderButton,
  renderTextInput,
  renderStatusBadge,
  renderSaveIndicator,
  renderLessonRail,
  renderContentTree,
  renderProgressLine,
  renderCourseRow,
  renderDialog,
} from '../src/components/common/index.ts';

test('Accessible Shared Components (design.md §6, T010)', async (t) => {
  await t.test('Button variants, accessible names, and disabled states', () => {
    const primary = renderButton({ label: 'Submit solution', variant: 'primary' });
    assert.strictEqual(primary.includes('btn-primary'), true);
    assert.strictEqual(primary.includes('Submit solution'), true);

    const disabled = renderButton({ label: 'Run', disabled: true });
    assert.strictEqual(disabled.includes('disabled'), true);
    assert.strictEqual(disabled.includes('aria-disabled="true"'), true);

    const iconBtn = renderButton({ label: 'Settings', ariaLabel: 'Open course settings', icon: '⚙' });
    assert.strictEqual(iconBtn.includes('aria-label="Open course settings"'), true);
  });

  await t.test('TextInput with persistent labels, hints, and error announcements', () => {
    const inputWithErr = renderTextInput({
      id: 'email',
      name: 'email',
      label: 'Email address',
      required: true,
      hint: 'We will send a confirmation link',
      error: 'Enter a valid email address',
    });

    assert.strictEqual(inputWithErr.includes('for="email"'), true);
    assert.strictEqual(inputWithErr.includes('Email address'), true);
    assert.strictEqual(inputWithErr.includes('aria-describedby="email-error email-hint"'), true);
    assert.strictEqual(inputWithErr.includes('aria-invalid="true"'), true);
    assert.strictEqual(inputWithErr.includes('role="alert"'), true);
  });

  await t.test('StatusBadge never relies on color alone', () => {
    const successBadge = renderStatusBadge({ status: 'success', label: 'Passed' });
    assert.strictEqual(successBadge.includes('✓'), true);
    assert.strictEqual(successBadge.includes('Passed'), true);

    const warningBadge = renderStatusBadge({ status: 'warning', label: 'Waived' });
    assert.strictEqual(warningBadge.includes('⚠'), true);
    assert.strictEqual(warningBadge.includes('Waived'), true);
  });

  await t.test('SaveIndicator conveys truth about state', () => {
    const saved = renderSaveIndicator({ status: 'saved' });
    assert.strictEqual(saved.includes('Saved'), true);
    assert.strictEqual(saved.includes('aria-live="polite"'), true);

    const unsaved = renderSaveIndicator({ status: 'unsaved' });
    assert.strictEqual(unsaved.includes('Not saved — retrying'), true);
  });

  await t.test('LessonRail marks current, completed, and waived steps with accessible text', () => {
    const rail = renderLessonRail({
      steps: [
        { id: 's1', ordinal: 1, title: 'Intro', type: 'theory', isCurrent: false, isCompleted: true, isRequired: true },
        { id: 's2', ordinal: 2, title: 'Code', type: 'python', isCurrent: true, isCompleted: false, isRequired: true },
        { id: 's3', ordinal: 3, title: 'Bug', type: 'python', isCurrent: false, isCompleted: false, isWaived: true, isRequired: true },
      ],
    });

    assert.strictEqual(rail.includes('aria-current="step"'), true);
    assert.strictEqual(rail.includes('Completed.'), true);
    assert.strictEqual(rail.includes('Current step.'), true);
    assert.strictEqual(rail.includes('Waived.'), true);
  });

  await t.test('ContentTree renders hierarchical semantics and indentation', () => {
    const tree = renderContentTree({
      courseTitle: 'Python foundations',
      modules: [
        {
          id: 'm1',
          title: 'Variables',
          lessons: [
            {
              id: 'l1',
              title: 'Values',
              steps: [{ id: 'st1', title: 'Naming', type: 'theory' }],
            },
          ],
        },
      ],
    });

    assert.strictEqual(tree.includes('role="tree"'), true);
    assert.strictEqual(tree.includes('role="treeitem"'), true);
    assert.strictEqual(tree.includes('Variables'), true);
    assert.strictEqual(tree.includes('Values'), true);
    assert.strictEqual(tree.includes('Naming'), true);
  });

  await t.test('ProgressLine calculates percentage and formats exact readable count', () => {
    const prog = renderProgressLine({ satisfiedRequiredCount: 12, totalRequiredCount: 20 });
    assert.strictEqual(prog.includes('12 of 20 required steps'), true);
    assert.strictEqual(prog.includes('width: 60%'), true);
    assert.strictEqual(prog.includes('aria-valuenow="12"'), true);
    assert.strictEqual(prog.includes('aria-valuemax="20"'), true);
  });

  await t.test('Dialog renders accessible modal semantics and consequence buttons', () => {
    const dialog = renderDialog({
      id: 'delete-confirm',
      title: 'Delete course draft',
      bodyHtml: '<p>Are you sure you want to delete this unpublished draft? This cannot be undone.</p>',
      confirmLabel: 'Delete draft',
      isDestructive: true,
      variant: 'confirm',
    });

    assert.strictEqual(dialog.includes('role="dialog"'), true);
    assert.strictEqual(dialog.includes('aria-modal="true"'), true);
    assert.strictEqual(dialog.includes('btn-destructive'), true);
    assert.strictEqual(dialog.includes('Delete draft'), true);
  });
});
