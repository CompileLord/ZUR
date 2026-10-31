// Authoring helpers for the demo course catalogue. Markdown/Python sources are written with
// the tag below so they can contain backticks and backslashes verbatim: write ¦ for a backtick.
export const t = (strings: TemplateStringsArray): string => strings.raw[0].replaceAll('¦', '`').replace(/^\n/, '');

export interface TestDef { stdin: string; out: string; hidden?: boolean }

export type StepDef =
  | { type: 'theory'; title: string; minutes: number; markdown: string }
  | { type: 'video'; title: string; minutes: number; videoUrl: string; provider: 'youtube'; transcript: string }
  | {
      type: 'quiz'; title: string; minutes: number; quizType: 'single_choice' | 'multiple_choice';
      prompt: string; options: Array<[text: string, correct: boolean]>; explanation: string;
    }
  | {
      type: 'python'; title: string; minutes: number; statement: string; input: string; output: string;
      constraints: string; starter: string; solution: string; hints: string[]; explanation: string;
      tests: TestDef[];
    };

export interface LessonDef { title: string; description: string; steps: StepDef[] }
export interface ModuleDef { title: string; lessons: LessonDef[] }
export interface CourseDef {
  slug: string; mentorEmail: string; title: string; description: string; tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced'; outcomes: string[]; prerequisites: string; modules: ModuleDef[];
}
export interface MentorDef { id: string; email: string; name: string; password: string }

export const theory = (title: string, minutes: number, markdown: string): StepDef => ({ type: 'theory', title, minutes, markdown });

export const video = (title: string, minutes: number, videoId: string, transcript: string): StepDef => ({
  type: 'video', title, minutes, videoUrl: `https://www.youtube-nocookie.com/embed/${videoId}`, provider: 'youtube', transcript,
});

export const quiz = (
  title: string, quizType: 'single_choice' | 'multiple_choice', prompt: string,
  options: Array<[string, boolean]>, explanation: string, minutes = 3,
): StepDef => ({ type: 'quiz', title, minutes, quizType, prompt, options, explanation });

export const py = (title: string, minutes: number, d: {
  statement: string; input: string; output: string; constraints: string; starter: string; solution: string;
  hints: string[]; explanation: string; tests: TestDef[];
}): StepDef => ({ type: 'python', title, minutes, ...d });
