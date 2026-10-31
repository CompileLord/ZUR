import type { CourseVisibility, EnrollmentPolicy, PublicationStatus } from 'zur-shared';

export interface ListOwnedCoursesOptions {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CourseSummary {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName?: string;
  tags: string[];
  difficulty: string;
  language: string;
  learningOutcomes: string[];
  prerequisites: string;
  estimatedDurationMinutes: number;
  visibility: CourseVisibility;
  enrollmentPolicy: EnrollmentPolicy;
  publicationStatus: PublicationStatus;
  isSuspended: boolean;
  draftRevision: number;
  currentVersionId?: string | null;
  currentVersionNumber?: number | null;
  versions?: Array<{ id: string; versionNumber: number; publishedAt: string; activeLearnerCount: number }>;
  studentCount: number;
  hasUnpublishedChanges: boolean;
  lastEditTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseMetadataInput {
  title?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  language?: string;
  learningOutcomes?: string[];
  prerequisites?: string;
  estimatedDurationMinutes?: number;
}
