import type { CourseDef } from './helpers.ts';
import { classesAndObjectsModule } from './oop-python/classes-and-objects.ts';
import { inheritanceAndPolymorphismModule } from './oop-python/inheritance-and-polymorphism.ts';
import { robustCodeModule } from './oop-python/robust-code.ts';

export const oopPython: CourseDef = {
  slug: 'object-oriented-python',
  mentorEmail: 'elena.marsh@zur.local',
  title: 'Object-Oriented Python',
  description:
    'Model real problems with classes. Build up from objects and state to inheritance, special methods, exceptions and composition, with a driver-based exercise in every lesson.',
  tags: ['python', 'oop', 'design'],
  difficulty: 'intermediate',
  outcomes: [
    'Design classes with attributes, methods and clear responsibilities',
    'Reuse behaviour with inheritance and polymorphism',
    'Make your own types feel native with special methods',
    'Handle and raise exceptions deliberately',
    'Choose between inheritance and composition',
  ],
  prerequisites: 'Python Fundamentals, or equivalent comfort with functions, loops, lists and dictionaries.',
  modules: [
    classesAndObjectsModule,
    inheritanceAndPolymorphismModule,
    robustCodeModule,
  ],
};
