import type { DatabaseSync } from 'node:sqlite';

export function seedCourseContent(db: DatabaseSync, now: string) {
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
        videoUrl: 'https://www.youtube-nocookie.com/embed/cQT33yu9pY8',
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


    return { course1Id, mod1Id, mod2Id, mod3Id, les1Id, les2Id, les3Id, step1Id, step2Id, step3Id, step4Id, step5Id, step6Id, step7Id };
}
