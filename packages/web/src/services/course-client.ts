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
  } = {}): Promise<{ courses: CatalogCourseItem[]; total: number; limit: number; offset: number }> {
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
}
