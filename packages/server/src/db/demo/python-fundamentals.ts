import type { CourseDef } from './helpers.ts';
import { gettingStartedModule } from './python-fundamentals/getting-started.ts';
import { makingDecisionsModule } from './python-fundamentals/making-decisions.ts';
import { loopsModule } from './python-fundamentals/loops.ts';
import { functionsAndCollectionsModule } from './python-fundamentals/functions-and-collections.ts';

export const pythonFundamentals: CourseDef = {
  slug: 'python-fundamentals',
  mentorEmail: 'elena.marsh@zur.local',
  title: 'Python Fundamentals: From Zero to Scripts',
  description:
    'A hands-on first course in Python. Learn to think in code through short lessons, quizzes and 17 graded exercises covering variables, decisions, loops, strings, functions, lists and dictionaries.',
  tags: ['python', 'beginner', 'fundamentals'],
  difficulty: 'beginner',
  outcomes: [
    'Read and write simple Python programs that take input and produce output',
    'Use variables, numbers, strings and booleans correctly',
    'Control program flow with if/elif/else, for and while',
    'Break problems into reusable functions',
    'Store and process data with lists and dictionaries',
  ],
  prerequisites: 'None. Suitable for complete beginners.',
  modules: [
    gettingStartedModule,
    makingDecisionsModule,
    loopsModule,
    functionsAndCollectionsModule,
  ],
};
