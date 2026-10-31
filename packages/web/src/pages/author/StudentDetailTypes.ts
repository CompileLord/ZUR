export interface StudentDetailPageProps {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  data: {
    enrollment: {
      id: string;
      courseId: string;
      courseTitle: string;
      courseVersionId: string;
      versionNumber: number | null;
      status: 'active' | 'revoked' | 'left';
      enrolledAt: string;
      revokedAt: string | null;
      revocationReason: string | null;
      completedAt: string | null;
    };
    student: {
      id: string;
      displayName: string;
      email?: string | null;
    };
    overallProgress: {
      requiredStepsCompleted: number;
      totalRequiredSteps: number;
      percentage: number;
      lastLearningActivityAt: string | null;
    };
    curriculum: Array<{
      id: string;
      title: string;
      ordinal: number;
      lessons: Array<{
        id: string;
        title: string;
        ordinal: number;
        steps: Array<{
          id: string;
          title: string;
          type: 'theory' | 'video' | 'quiz' | 'python';
          ordinal: number;
          isRequired: boolean;
        }>;
      }>;
    }>;
    stepProgress: Record<string, {
      satisfied: boolean;
      completedAt: string | null;
      submissionCount: number;
      bestScore: number | null;
      isWaived: boolean;
      waivedAt?: string | null;
    }>;
    attempts: Record<string, Array<{
      id: string;
      attemptNumber: number;
      verdict: string;
      score: number | null;
      submittedAt: string;
      submittedCode?: string | null;
      isLatest: boolean;
    }>>;
    waivers: Record<string, { waivedAt: string; reason: string }>;
  };
  selectedStepId?: string;
  selectedAttemptId?: string;
  attemptPagination?: { offset: number; limit: number; total: number };
  actionMessage?: { type: 'success' | 'error'; text: string };
}
