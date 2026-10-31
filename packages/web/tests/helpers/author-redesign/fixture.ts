import type { TestContext } from 'node:test';

export async function setupAuthorRedesignFixture(_t: TestContext) {
  const dummyModules = [
    {
      id: 'mod-1',
      courseId: 'course-1',
      title: 'Module 1: Foundations',
      position: 0,
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          title: 'Lesson 1: Intro',
          position: 0,
          steps: [
            { id: 's-1', lessonId: 'les-1', type: 'theory' as const, title: 'Concept', position: 0, isRequired: true, estimatedDurationMinutes: 5 },
            { id: 's-2', lessonId: 'les-1', type: 'video' as const, title: 'Walkthrough', position: 1, isRequired: true, estimatedDurationMinutes: 10 },
            { id: 's-3', lessonId: 'les-1', type: 'quiz' as const, title: 'Quiz', position: 2, isRequired: true, estimatedDurationMinutes: 5 },
            { id: 's-4', lessonId: 'les-1', type: 'python' as const, title: 'Exercise', position: 3, isRequired: true, estimatedDurationMinutes: 15 },
          ],
        },
      ],
    },
  ];

  return { dummyModules };
}

export type AuthorRedesignFixture = Awaited<ReturnType<typeof setupAuthorRedesignFixture>>;
