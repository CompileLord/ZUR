export interface StudentsAndInvitationsPageProps {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  totalStudentsCount: number;
  roster: {
    items: Array<{
      enrollmentId: string;
      userId: string;
      displayName: string;
      email?: string | null;
      versionNumber: number | null;
      versionId: string | null;
      status: string;
      requiredStepsCompleted: number;
      totalRequiredSteps: number;
      progressPercentage: number;
      lastLearningActivityAt: string | null;
      enrolledAt: string;
    }>;
    totalCount?: number;
    total?: number;
    limit: number;
    offset: number;
  };
  invitations: Array<{
    id: string;
    courseId: string;
    type: 'email' | 'shareable_link';
    recipientEmail: string | null;
    expiresAt: string;
    maxUses: number | null;
    usesCount: number;
    isRevoked: boolean;
    emailDeliveryStatus?: 'pending' | 'sent' | 'failed' | 'not_configured' | null;
    emailSentAt?: string | null;
    createdAt: string;
  }>;
  availableVersions?: Array<{ id: string; versionNumber: number }>;
  currentTab?: 'enrolled' | 'invitations';
  filters?: {
    search?: string;
    status?: string;
    version?: string;
  };
  actionMessage?: { type: 'success' | 'error'; text: string };
}
