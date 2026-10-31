import type { CourseDef } from './helpers.ts';
import { efficiencyModule } from './dsa-python/efficiency.ts';
import { coreDataStructuresModule } from './dsa-python/core-data-structures.ts';
import { recursionAndSortingModule } from './dsa-python/recursion-and-sorting.ts';
import { treesAndGraphsModule } from './dsa-python/trees-and-graphs.ts';

export const dsaPython: CourseDef = {
  slug: 'data-structures-algorithms-python',
  mentorEmail: 'rohan.iyer@zur.local',
  title: 'Data Structures and Algorithms in Python',
  description:
    'The core toolkit for solving problems efficiently: complexity analysis, searching, stacks, hash maps, recursion, sorting, trees and graphs. Every lesson ends with graded problems in the style of technical interviews.',
  tags: ['algorithms', 'data-structures', 'interview'],
  difficulty: 'intermediate',
  outcomes: [
    'Estimate the time complexity of code with Big-O notation',
    'Choose the right data structure for a problem',
    'Write recursive and iterative solutions confidently',
    'Implement classic sorting and searching algorithms',
    'Traverse trees and graphs with DFS and BFS',
  ],
  prerequisites: 'Comfortable with Python functions, loops, lists and dictionaries.',
  modules: [
    efficiencyModule,
    coreDataStructuresModule,
    recursionAndSortingModule,
    treesAndGraphsModule,
  ],
};
