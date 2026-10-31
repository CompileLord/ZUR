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

export interface RemoteUpdateInfo {
  agentName: string;
  timestampText?: string;
  newRevision: number;
  hasLocalEdits?: boolean;
}

export interface CourseBuilderPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  saveStatusText?: string;
  modules: ModuleSummary[];
  selectedType?: 'course' | 'module' | 'lesson' | 'step';
  selectedId?: string;
  feedbackMessage?: string;
  remoteUpdate?: RemoteUpdateInfo;
  lastEditTime?: string;
  /** Ids of steps with blocking validation errors (shown as a dot in the tree). */
  invalidStepIds?: string[];
}
