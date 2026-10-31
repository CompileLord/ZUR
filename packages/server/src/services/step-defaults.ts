import crypto from 'node:crypto';
import type { StepType } from 'zur-shared';

/**
 * Content for a step the author has just added. Every field the learner would read starts empty,
 * so validation blocks publishing until the author writes it; placeholders must never ship.
 */
export function defaultStepContent(type: StepType): Record<string, unknown> {
  switch (type) {
    case 'theory':
      return { kind: 'theory', markdown: '' };
    case 'video':
      return { kind: 'video', videoUrl: '', provider: 'youtube', transcript: '', captionVerified: false };
    case 'quiz':
      return {
        kind: 'quiz',
        quizType: 'single_choice',
        prompt: '',
        options: [
          { id: crypto.randomUUID(), text: '', isCorrect: false },
          { id: crypto.randomUUID(), text: '', isCorrect: false },
        ],
        explanation: '',
      };
    case 'python':
      return {
        kind: 'python',
        problemStatement: '',
        inputFormat: '',
        outputFormat: '',
        constraints: '',
        starterCode: '',
        referenceSolution: '',
        hints: [],
        solutionExplanation: '',
        runtimeLimits: { cpuTimeoutSeconds: 5, wallTimeoutSeconds: 10, memoryLimitMib: 128 },
      };
  }
}
