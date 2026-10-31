export interface StepSummary {
  id: string;
  lessonId: string;
  type: 'theory' | 'video' | 'quiz' | 'python';
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export interface LessonSummary {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  steps: StepSummary[];
}

export interface ModuleSummary {
  id: string;
  courseId: string;
  title: string;
  position: number;
  lessons: LessonSummary[];
}

export interface RenderAuthorTreeOptions {
  courseId: string;
  courseTitle: string;
  modules: ModuleSummary[];
  selectedType?: 'course' | 'module' | 'lesson' | 'step';
  selectedId?: string;
  isEditor?: boolean;
  title?: string;
  invalidStepIds?: string[];
}


export function stepEditHref(courseId: string, type: StepSummary['type'], id: string): string {
  return `/teach/${encodeURIComponent(courseId)}/content/${type}/${encodeURIComponent(id)}`;
}
