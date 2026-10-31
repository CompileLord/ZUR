import type { DatabaseSync } from 'node:sqlite';

export function seedCourseVersions(
  db: DatabaseSync,
  now: string,
  { course1Id, mod1Id, mod2Id, mod3Id, les1Id, les2Id, les3Id, step1Id, step2Id, step3Id, step4Id, step5Id, step6Id, step7Id }: {
    course1Id: string;
    mod1Id: string;
    mod2Id: string;
    mod3Id: string;
    les1Id: string;
    les2Id: string;
    les3Id: string;
    step1Id: string;
    step2Id: string;
    step3Id: string;
    step4Id: string;
    step5Id: string;
    step6Id: string;
    step7Id: string;
  },
) {
    // 5. Course Versions
    // Version 1 (Grace Hopper's old pinned version)
    const ver1Id = 'version-1-snapshot';
    db.prepare(`
      INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at)
      VALUES (?, ?, 1, ?, '${now}')
    `).run(
      ver1Id,
      course1Id,
      JSON.stringify({
        courseId: course1Id,
        versionNumber: 1,
        sourceRevision: 1,
        title: 'Python foundations',
        description: 'Version 1 initial snapshot',
        modules: [{ id: mod1Id, title: 'Variables', position: 0, lessons: [{ id: les1Id, title: 'Naming and Values', position: 0, steps: [
          { id: step1Id, title: 'What is a variable?', type: 'theory', position: 0, isRequired: true },
          { id: step2Id, title: 'Variables in Memory', type: 'video', position: 1, isRequired: true },
          { id: step3Id, title: 'Variable assignment syntax', type: 'quiz', position: 2, isRequired: true },
          { id: step4Id, title: 'Echoing Numbers', type: 'python', position: 3, isRequired: true },
        ] }] }],
        publishedAt: now,
      })
    );

    // Version 2 (Current published version)
    const ver2Id = 'version-2-snapshot';
    db.prepare(`
      INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at)
      VALUES (?, ?, 2, ?, '${now}')
    `).run(
      ver2Id,
      course1Id,
      JSON.stringify({
        courseId: course1Id,
        versionNumber: 2,
        sourceRevision: 1,
        title: 'Python foundations',
        description: 'Version 2 with complete modules',
        modules: [
          { id: mod1Id, title: 'Variables', position: 0, lessons: [{ id: les1Id, title: 'Naming and Values', position: 0, steps: [
            { id: step1Id, title: 'What is a variable?', type: 'theory', position: 0, isRequired: true },
            { id: step2Id, title: 'Variables in Memory', type: 'video', position: 1, isRequired: true },
            { id: step3Id, title: 'Variable assignment syntax', type: 'quiz', position: 2, isRequired: true },
            { id: step4Id, title: 'Echoing Numbers', type: 'python', position: 3, isRequired: true },
          ] }] },
          { id: mod2Id, title: 'Conditions', position: 1, lessons: [{ id: les2Id, title: 'Branching', position: 0, steps: [
            { id: step5Id, title: 'Valid conditional expressions', type: 'quiz', position: 0, isRequired: true },
            { id: step6Id, title: 'Check Even or Odd', type: 'python', position: 1, isRequired: true, content: {
              kind: 'python',
              problemStatement: 'Read an integer from input. Print Even if even, Odd if odd. If input is empty, print Empty.',
              inputFormat: 'An integer or empty string.',
              outputFormat: 'Even, Odd, or Empty.',
              constraints: '-10^6 <= N <= 10^6',
              starterCode: '# Check even or odd\nimport sys\nraw = sys.stdin.read().strip()\nif not raw:\n    print("Empty")\n',
              referenceSolution: 'import sys\nraw = sys.stdin.read().strip()\nif not raw:\n    print("Empty")\nelse:\n    n = int(raw)\n    print("Even" if n % 2 == 0 else "Odd")\n',
              hints: ['Check for empty string first.', 'Use the % modulo operator to test evenness.'],
              solutionExplanation: 'Check empty input before converting it to an integer.',
              testCases: [
                { id: 'tc-2-pub1', stdin: '4', expectedStdout: 'Even', position: 0, isHidden: false },
                { id: 'tc-2-pub-blank', stdin: '', expectedStdout: 'Empty', position: 1, isHidden: false },
                { id: 'tc-2-hidden', stdin: '-3', expectedStdout: 'Odd', position: 2, isHidden: true },
              ],
            } },
          ] }] },
          { id: mod3Id, title: 'Loops', position: 2, lessons: [{ id: les3Id, title: 'For and While', position: 0, steps: [
            { id: step7Id, title: 'Sum of Numbers', type: 'python', position: 0, isRequired: true },
          ] }] },
        ],
        publishedAt: now,
      })
    );

    for (const versionId of [ver1Id, ver2Id]) {
      const versionRow = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as any;
      const snapshot = JSON.parse(versionRow.snapshot_data);
      for (const module of snapshot.modules || []) {
        for (const lesson of module.lessons || []) {
          for (const step of lesson.steps || []) {
            const contentRow = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(step.id) as any;
            if (step.type !== 'python') {
              // Keep the legacy V1 fixture intentionally contentless for its
              // compatibility and unavailable-content route checks.
              if (versionId === ver1Id) continue;
              step.content = contentRow ? JSON.parse(contentRow.content_payload) : null;
              continue;
            }
            const testRows = db.prepare('SELECT id, stdin, expected_stdout, is_hidden, position, created_at FROM test_cases WHERE step_id = ? ORDER BY position ASC').all(step.id) as any[];
            step.content = {
              ...(contentRow ? JSON.parse(contentRow.content_payload) : {}),
              testCases: testRows.map((row) => ({
                id: row.id,
                stepId: step.id,
                stdin: row.stdin || '',
                expectedStdout: row.expected_stdout || '',
                isHidden: Boolean(row.is_hidden),
                position: row.position,
                createdAt: row.created_at,
              })),
            };
          }
        }
      }
      db.prepare('UPDATE course_versions SET snapshot_data = ? WHERE id = ?').run(JSON.stringify(snapshot), versionId);
    }

    // Update course current_version_id
    db.prepare(`UPDATE courses SET current_version_id = ? WHERE id = ?`).run(ver2Id, course1Id);

    return { ver1Id, ver2Id };
}
