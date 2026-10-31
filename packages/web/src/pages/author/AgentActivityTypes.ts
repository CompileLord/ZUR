export interface ActivityItem {
  id: string;
  tokenId: string;
  tokenLabel: string;
  toolName: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: string[] | Record<string, unknown> | any;
  outcome: 'success' | 'failure' | string;
  correlationId?: string | null;
  createdAt: string;
}

export interface MutationDetail extends ActivityItem {
  courseId: string;
  idempotencyKey?: string;
  priorContent?: any | null;
  newContent?: any | null;
}

export interface RecoveryRevisionSummary {
  id: string;
  courseId: string;
  revisionNumber: number;
  createdBy: string;
  reason: string;
  createdAt: string;
}

export interface AgentActivityPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  activities: ActivityItem[];
  totalActivities?: number;
  currentPage?: number;
  totalPages?: number;
  selectedMutation?: MutationDetail | null;
  recoveryRevisions?: RecoveryRevisionSummary[];
  selectedRecoveryRevision?: RecoveryRevisionSummary | null;
  showRestoreConfirmModal?: boolean;
  currentDraftRevision?: number;
  connections?: { id: string; label: string }[];
  filterConnection?: string;
  filterDate?: string;
  filterTool?: string;
  filterOutcome?: string;
  recoveryError?: string;
  restoreConflict?: {
    message: string;
    currentRevision?: number;
  };
  feedbackMessage?: string;
  errorMessage?: string;
}
