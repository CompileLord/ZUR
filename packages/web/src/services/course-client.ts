import { AuthClient } from './auth-client.ts';
import type { CatalogCourseItem, CatalogCategoryItem } from '../pages/public/CatalogPage.ts';
import type { CourseOverviewData } from '../pages/public/CourseOverviewPage.ts';

export class CourseClient {
  private static instance: CourseClient;
  private authClient = AuthClient.getInstance();

  private constructor() {}

  static getInstance(): CourseClient {
    if (!CourseClient.instance) {
      CourseClient.instance = new CourseClient();
    }
    return CourseClient.instance;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.authClient.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async listCatalog(params: {
    search?: string;
    categoryId?: string;
    level?: string;
    language?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ courses: CatalogCourseItem[]; total: number; limit: number; offset: number; languages?: string[] }> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.categoryId) query.set('categoryId', params.categoryId);
    if (params.level) query.set('level', params.level);
    if (params.language) query.set('language', params.language);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/courses/catalog?${query.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to load course catalog');
    }

    return res.json().catch(() => {
      throw new Error('Could not load the course catalog. Please try again.');
    });
  }

  async listCategories(): Promise<CatalogCategoryItem[]> {
    const res = await fetch('/api/categories', {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      return [];
    }

    return res.json();
  }

  async getCourseOverview(courseId: string): Promise<CourseOverviewData> {
    let res: Response;
    try {
      res = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
    } catch {
      const err: any = new Error('Network error. Failed to reach server.');
      err.status = 0;
      err.isNetworkError = true;
      throw err;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err: any = new Error(errBody.error?.message || "This page isn't available.");
      err.status = res.status;
      err.code = errBody.error?.code;
      throw err;
    }

    return res.json();
  }

  async enrollInCourse(courseId: string, invitationToken?: string): Promise<{ id: string; status: string }> {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseId)}/enroll`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ invitationToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to enroll in course');
    }

    return res.json();
  }

  async submitReport(data: {
    courseId: string;
    courseVersionId?: string;
    stepId?: string;
    type: string;
    description: string;
    includeCodeConsent?: boolean;
  }): Promise<{ id: string; reference: string; status: string }> {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to submit report. Please try again.');
    }

    return res.json();
  }

  async getRoster(
    courseId: string,
    params: { search?: string; status?: string; version?: string; limit?: number; offset?: number } = {}
  ): Promise<any> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.version) query.set('version', params.version);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));

    const res = await fetch(`/api/author/courses/${encodeURIComponent(courseId)}/roster?${query.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to load course roster');
    }

    return res.json();
  }

  async getStudentDetail(courseId: string, enrollmentId: string): Promise<any> {
    const res = await fetch(
      `/api/author/courses/${encodeURIComponent(courseId)}/roster/${encodeURIComponent(enrollmentId)}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to load student detail');
    }

    return res.json();
  }

  async getStudentAttempts(courseId: string, enrollmentId: string, stepId: string, limit = 10, offset = 0): Promise<any> {
    const res = await fetch(`/api/author/courses/${encodeURIComponent(courseId)}/roster/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/attempts?limit=${limit}&offset=${offset}`, { headers: this.getHeaders() });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || 'Failed to load submitted attempts'); }
    return res.json();
  }

  async getStudentAttempt(courseId: string, enrollmentId: string, stepId: string, attemptId: string): Promise<any> {
    const res = await fetch(`/api/author/courses/${encodeURIComponent(courseId)}/roster/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/attempts/${encodeURIComponent(attemptId)}`, { headers: this.getHeaders() });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || 'Failed to load submitted attempt'); }
    return res.json();
  }

  async revokeStudent(courseId: string, enrollmentId: string, reason?: string): Promise<{ success: boolean; enrollmentId: string; status: string }> {
    const res = await fetch(
      `/api/author/courses/${encodeURIComponent(courseId)}/roster/${encodeURIComponent(enrollmentId)}/revoke`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ reason }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to revoke student access');
    }

    return res.json();
  }

  async reinstateStudent(courseId: string, enrollmentId: string, reason?: string): Promise<{ success: boolean; enrollmentId: string; status: string }> {
    const res = await fetch(
      `/api/author/courses/${encodeURIComponent(courseId)}/roster/${encodeURIComponent(enrollmentId)}/reinstate`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ reason }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to reinstate student access');
    }

    return res.json();
  }

  async listInvitations(courseId: string): Promise<{ invitations: any[] }> {
    const res = await fetch(`/api/author/courses/${encodeURIComponent(courseId)}/invitations`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to load invitations');
    }

    return res.json();
  }

  async createInvitation(
    courseId: string,
    input: { type: 'email' | 'shareable_link'; recipientEmail?: string; maxUses?: number; expiresInDays?: number }
  ): Promise<{ invitation: any; token: string; delivery?: { status: 'sent' | 'failed' | 'not_configured'; message: string; sentAt: string | null } | null }> {
    const res = await fetch(`/api/author/courses/${encodeURIComponent(courseId)}/invitations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to create invitation');
    }

    return res.json();
  }

  async revokeInvitation(invitationId: string): Promise<{ success: boolean; invitationId: string }> {
    const res = await fetch(`/api/author/invitations/${encodeURIComponent(invitationId)}/revoke`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to revoke invitation');
    }

    return res.json();
  }

  async resendInvitation(invitationId: string): Promise<{ invitation: any; token: string; delivery?: { status: 'sent' | 'failed' | 'not_configured'; message: string; sentAt: string | null } | null }> {
    const res = await fetch(`/api/author/invitations/${encodeURIComponent(invitationId)}/resend`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to resend invitation');
    }

    return res.json();
  }

  async getCourseAnalytics(
    courseId: string,
    params: { versionNumber?: number; windowDays?: number } = {}
  ): Promise<any> {
    const query = new URLSearchParams();
    if (params.versionNumber) query.set('versionNumber', String(params.versionNumber));
    if (params.windowDays !== undefined) query.set('timeWindowDays', String(params.windowDays));

    const res = await fetch(
      `/api/author/courses/${encodeURIComponent(courseId)}/analytics?${query.toString()}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to load course analytics');
    }

    return res.json();
  }

  async revealHint(enrollmentId: string, stepId: string, hintIndex?: number): Promise<{ success: boolean; hintIndex?: number }> {
    const res = await fetch(
      `/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/hint-reveal`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ hintIndex }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to record hint reveal');
    }

    return res.json();
  }
}
