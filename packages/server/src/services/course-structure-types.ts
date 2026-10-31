import type { StepType } from 'zur-shared';

export interface StepTreeSummary {
  id: string;
  lessonId: string;
  type: StepType;
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export interface LessonTreeSummary {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  steps: StepTreeSummary[];
}

export interface ModuleTreeSummary {
  id: string;
  courseId: string;
  title: string;
  position: number;
  lessons: LessonTreeSummary[];
}

export interface CourseTree {
  courseId: string;
  courseTitle: string;
  modules: ModuleTreeSummary[];
  totalSteps: number;
}
