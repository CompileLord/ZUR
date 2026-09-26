import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';

export function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export function seedDatabase(dbPath?: string): void {
  const db = getDatabase(dbPath);

  db.exec('BEGIN TRANSACTION;');
  try {
    // Clean existing data for deterministic re-seeding
    const tables = [
      'step_progress', 'assessment_attempts', 'code_drafts', 'execution_jobs',
      'test_cases', 'step_contents', 'steps', 'lessons', 'modules',
      'enrollments', 'invitations', 'course_versions', 'courses', 'categories',
      'author_access_tokens', 'agent_mutations', 'recovery_revisions', 'media_assets', 'admin_support_access',
      'media_uploads', 'reports', 'audit_events', 'verification_tokens', 'sessions', 'users', 'deletion_registry',
      'product_analytics_events', 'privacy_requests'
    ];
    for (const t of tables) {
      db.exec(`DELETE FROM ${t};`);
    }

    const now = new Date().toISOString();

    // 1. Users
    const users = [
      {
        id: 'user-admin-1',
        email: 'margaret@zur.internal',
        password_hash: hashPassword('AdminPass123!'),
        display_name: 'Margaret Hamilton',
        email_verified: 1,
        capabilities: JSON.stringify(['student', 'admin']),
        account_status: 'active',
      },
      {
        id: 'user-author-1',
        email: 'guido@zur.internal',
        password_hash: hashPassword('AuthorPass123!'),
        display_name: 'Guido van Rossum',
        email_verified: 1,
        capabilities: JSON.stringify(['student', 'author']),
        account_status: 'active',
      },
      {
        id: 'user-student-1',
        email: 'ada@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Ada Lovelace',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
      {
        id: 'user-student-2',
        email: 'grace@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Grace Hopper',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
      {
        id: 'user-student-3',
        email: 'alan@zur.internal',
        password_hash: hashPassword('StudentPass123!'),
        display_name: 'Alan Turing',
        email_verified: 1,
        capabilities: JSON.stringify(['student']),
        account_status: 'active',
      },
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
      VALUES (@id, @email, @password_hash, @display_name, @email_verified, @capabilities, @account_status, '${now}', '${now}')
    `);
    for (const u of users) insertUser.run(u);

    // 2. Categories
    db.prepare(`
      INSERT INTO categories (id, name, slug, created_at)
      VALUES ('cat-programming', 'Programming', 'programming', '${now}')
    `).run();

    // 3. Courses
    // Course 1: Python foundations (Published)
    const course1Id = 'course-python-foundations';
    db.prepare(`
      INSERT INTO courses (
        id, owner_id, title, description, category_id, tags, difficulty, language,
        learning_outcomes, prerequisites, estimated_duration_minutes, visibility,
        enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at
      ) VALUES (
        ?, 'user-author-1', 'Python foundations',
        'Learn Python through short lessons and real exercises. Understand it, then write it.',
        'cat-programming', '["python","basics","programming"]', 'beginner', 'en',
        '["Understand variables and types","Write conditional logic","Iterate collections with loops"]',
        'None. Suitable for complete beginners.', 45, 'public', 'open', 'published', 0, 1, '${now}', '${now}'
      )
    `).run(course1Id);

    // Course 2: Suspended course (Fixture per design §17)
    const course2Id = 'course-suspended-tricks';
    db.prepare(`
      INSERT INTO courses (
        id, owner_id, title, description, category_id, tags, difficulty, language,
        learning_outcomes, prerequisites, estimated_duration_minutes, visibility,
        enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at
      ) VALUES (
        ?, 'user-author-1', 'Unsafe Python Tricks',
        'Experimental scripts and low-level introspection.',
        'cat-programming', '["advanced","internals"]', 'advanced', 'en',
        '["Introspect Python internals"]', 'Python foundations', 30, 'public', 'open', 'published', 1, 1, '${now}', '${now}'
      )
    `).run(course2Id);

    // 4. Modules, Lessons, Steps for Course 1
    // Module 1: Variables
    const mod1Id = 'mod-1-variables';
    db.prepare(`INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, 'Variables', 0, '${now}', '${now}')`).run(mod1Id, course1Id);

    const les1Id = 'les-1-naming';
    db.prepare(`INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, 'Naming and Values', 'Learn how names store values in Python', 0, '${now}', '${now}')`).run(les1Id, mod1Id);

    // Step 1: Theory
    const step1Id = 'step-1-theory';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'theory', 'What is a variable?', 0, 1, 5, '${now}', '${now}')`).run(step1Id, les1Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-1',
      step1Id,
      JSON.stringify({
        kind: 'theory',
        markdown: '# What is a variable?\n\nA variable in Python binds a name to a value in memory.\n\n```python\nx = 42\nprint(x)\n```\n\n> Variables give meaning to raw data.',
      })
    );

    // Step 2: Video with transcript
    const step2Id = 'step-2-video';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'video', 'Variables in Memory', 1, 1, 10, '${now}', '${now}')`).run(step2Id, les1Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-2',
      step2Id,
      JSON.stringify({
        kind: 'video',
        videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        provider: 'youtube',
        transcript: 'Welcome to this lesson on variables. A variable is an identifier that references an object in memory.',
        captionVerified: true,
      })
    );

    // Step 3: Single-choice Quiz
    const step3Id = 'step-3-quiz-single';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'quiz', 'Variable assignment syntax', 2, 1, 3, '${now}', '${now}')`).run(step3Id, les1Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-3',
      step3Id,
      JSON.stringify({
        kind: 'quiz',
        quizType: 'single_choice',
        prompt: 'Which of the following correctly assigns the integer 10 to variable `n` in Python?',
        options: [
          { id: 'opt-1', text: 'n = 10', isCorrect: true },
          { id: 'opt-2', text: 'int n = 10;', isCorrect: false },
          { id: 'opt-3', text: 'let n = 10', isCorrect: false },
          { id: 'opt-4', text: 'n := 10', isCorrect: false },
        ],
        explanation: 'In Python, assignment uses a single equals sign `=` without type keywords.',
      })
    );

    // Step 4: Python exercise - Echoing Numbers
    const step4Id = 'step-4-python-echo';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Echoing Numbers', 3, 1, 10, '${now}', '${now}')`).run(step4Id, les1Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-4',
      step4Id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read an integer from standard input and print twice its value.',
        inputFormat: 'A single integer on standard input.',
        outputFormat: 'Print the doubled value.',
        constraints: '1 <= N <= 10^6',
        starterCode: '# Read input and double it\nimport sys\n\nval = int(sys.stdin.read().strip())\n# Print doubled value here\n',
        referenceSolution: 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n',
        hints: ['Use sys.stdin.read() or input() to get the string.', 'Convert string to int before multiplying.'],
        solutionExplanation: 'Multiplying an int by 2 doubles its mathematical value.',
        runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
      })
    );
    // Public test case
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-1-public', ?, '5', '10', 0, 0, '${now}')`).run(step4Id);
    // Hidden test case
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-1-hidden', ?, '100', '200', 1, 1, '${now}')`).run(step4Id);

    // Module 2: Conditions
    const mod2Id = 'mod-2-conditions';
    db.prepare(`INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, 'Conditions', 1, '${now}', '${now}')`).run(mod2Id, course1Id);

    const les2Id = 'les-2-branching';
    db.prepare(`INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, 'Branching', 'if and else statements', 0, '${now}', '${now}')`).run(les2Id, mod2Id);

    // Step 5: Multiple-choice Quiz
    const step5Id = 'step-5-quiz-multi';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'quiz', 'Valid conditional expressions', 0, 1, 5, '${now}', '${now}')`).run(step5Id, les2Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-5',
      step5Id,
      JSON.stringify({
        kind: 'quiz',
        quizType: 'multiple_choice',
        prompt: 'Select all expressions that evaluate to boolean True in Python:',
        options: [
          { id: 'opt-2-1', text: 'bool(1)', isCorrect: true },
          { id: 'opt-2-2', text: 'bool(0)', isCorrect: false },
          { id: 'opt-2-3', text: 'bool("hello")', isCorrect: true },
          { id: 'opt-2-4', text: 'bool([])', isCorrect: false },
        ],
        explanation: 'Non-zero numbers and non-empty collections evaluate to True.',
      })
    );

    // Step 6: Python exercise - Check Even or Odd (includes blank-input test and hidden failure)
    const step6Id = 'step-6-python-evenodd';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Check Even or Odd', 1, 1, 10, '${now}', '${now}')`).run(step6Id, les2Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-6',
      step6Id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read an integer from input. Print Even if even, Odd if odd. If input is empty, print Empty.',
        inputFormat: 'An integer or empty string.',
        outputFormat: 'Even, Odd, or Empty.',
        constraints: '-10^6 <= N <= 10^6',
        starterCode: '# Check even or odd\nimport sys\nraw = sys.stdin.read().strip()\nif not raw:\n    print("Empty")\n',
        referenceSolution: 'import sys\nraw = sys.stdin.read().strip()\nif not raw:\n    print("Empty")\nelse:\n    n = int(raw)\n    print("Even" if n % 2 == 0 else "Odd")\n',
        hints: ['Check for empty string first.', 'Use the % modulo operator to test evenness.'],
        runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
      })
    );
    // Public test case
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-2-pub1', ?, '4', 'Even', 0, 0, '${now}')`).run(step6Id);
    // Blank-input public test case (PRD/design §17 fixture)
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-2-pub-blank', ?, '', 'Empty', 0, 1, '${now}')`).run(step6Id);
    // Hidden test case
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-2-hidden', ?, '-3', 'Odd', 1, 2, '${now}')`).run(step6Id);

    // Module 3: Loops
    const mod3Id = 'mod-3-loops';
    db.prepare(`INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, 'Loops', 2, '${now}', '${now}')`).run(mod3Id, course1Id);

    const les3Id = 'les-3-forwhile';
    db.prepare(`INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, 'For and While', 'Iteration in Python', 0, '${now}', '${now}')`).run(les3Id, mod3Id);

    // Step 7: Python exercise - Sum of Numbers (Long traceback failure test per design §17)
    const step7Id = 'step-7-python-sum';
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Sum of Numbers', 0, 1, 10, '${now}', '${now}')`).run(step7Id, les3Id);
    db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${now}')`).run(
      'content-7',
      step7Id,
      JSON.stringify({
        kind: 'python',
        problemStatement: 'Read space-separated integers on a single line and print their sum.',
        inputFormat: 'Numbers separated by spaces.',
        outputFormat: 'Total sum.',
        constraints: 'Numbers fit in standard integer.',
        starterCode: '# Sum all numbers\nnums = input().split()\n',
        referenceSolution: 'print(sum(map(int, input().split())))\n',
        hints: ['Use map(int, ...) to convert all items.'],
        runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
      })
    );
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-3-pub', ?, '1 2 3 4 5', '15', 0, 0, '${now}')`).run(step7Id);
    db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-3-hidden', ?, '10 -10 20', '20', 1, 1, '${now}')`).run(step7Id);

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
            if (step.type !== 'python') continue;
            const contentRow = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(step.id) as any;
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

    // 6. Enrollments (design §17 fixtures)
    // Grace Hopper: pinned to old Version 1
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-grace', 'user-student-2', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver1Id);

    // Ada Lovelace: pinned to current Version 2
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-ada', 'user-student-1', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver2Id);

    // Alan Turing: pinned to current Version 2 with waived step
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-alan', 'user-student-3', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver2Id);

    // 7. Step Progress & Waiver (design §17 fixture)
    // Ada completed step 1
    db.prepare(`
      INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at)
      VALUES ('prog-ada-1', 'user-student-1', 'enr-ada', ?, 1, '${now}', 0, '${now}', '${now}')
    `).run(step1Id);

    // Alan Turing has waived step 4 (Python echo exercise)
    db.prepare(`
      INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, is_waived, waiver_reason, waived_by_id, created_at, updated_at)
      VALUES ('prog-alan-waived', 'user-student-3', 'enr-alan', ?, 0, 1, 'Exercise test case issue under review', 'user-admin-1', '${now}', '${now}')
    `).run(step4Id);

    // 8. Saved Code Draft for Ada (design §17 fixture)
    db.prepare(`
      INSERT INTO code_drafts (id, user_id, enrollment_id, step_id, code, revision, updated_at)
      VALUES ('draft-ada-4', 'user-student-1', 'enr-ada', ?, 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n', 1, '${now}')
    `).run(step4Id);

    // 9. Author Access Token for Guido (design §17 fixture)
    const tokenSecret = 'zur_sec_sample_author_mcp_token_256bit_entropy';
    const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
    db.prepare(`
      INSERT INTO author_access_tokens (
        id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, created_at
      ) VALUES (
        'tok-guido-1', 'user-author-1', 'zat_guido_active', ?, 'My course-writing agent',
        '["courses:read","courses:create","content:write","media:write","exercises:validate"]',
        NULL, datetime('now', '+30 days'), 0, '${now}'
      )
    `).run(tokenHash);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    seedDatabase();
    console.log('Deterministic fixture seed completed successfully.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}
