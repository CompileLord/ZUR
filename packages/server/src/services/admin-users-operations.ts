import crypto from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from 'zur-shared';
import { OperationalMetricsService } from './operational-metrics-service.ts';
import { AdminBase } from './admin-base.ts';

export class AdminUsersOperations extends AdminBase {
  getOperationsOverview(adminId: string, operationalMetrics?: OperationalMetricsService) {
    this.requireAdmin(adminId);
    const count = (sql: string, ...args: any[]) => (this.db.prepare(sql).get(...args) as any)?.count ?? 0;
    const oldest = this.db.prepare(`SELECT created_at FROM execution_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1`).get() as any;
    const settings = this.db.prepare(`SELECT updated_at FROM system_settings WHERE key = 'execution_paused'`).get() as any;
    const mail = this.db.prepare(`SELECT COUNT(*) AS total,SUM(email_delivery_status='sent') AS sent,SUM(email_delivery_status='pending') AS pending,COUNT(*) FILTER (WHERE email_delivery_status IN ('failed','not_configured')) AS issues,MAX(email_sent_at) AS lastSentAt FROM invitations WHERE type='email'`).get() as any;

    const metrics = operationalMetrics || this.operationalMetrics;
    const internalErrorRate = metrics?.getServerErrorRate
      ? metrics.getServerErrorRate()
      : {
          window: '5m',
          windowLabel: 'Last 5 minutes',
          windowSeconds: 300,
          numerator: 0,
          denominator: 0,
          rate: null,
          rateFormatted: 'Unavailable',
          status: 'insufficient_telemetry' as const,
          client4xxErrors: 0,
          retentionPolicy: 'In-memory recent request buffer (resets on process restart)',
        };

    const window24h = new Date(Date.now() - 86400000).toISOString();
    const infraErrors = count("SELECT COUNT(*) count FROM assessment_attempts WHERE is_infrastructure_failure=1 AND created_at >= ?", window24h);
    const totalAttempts = count("SELECT COUNT(*) count FROM assessment_attempts WHERE created_at >= ?", window24h);
    const failedJobs = count("SELECT COUNT(*) count FROM execution_jobs WHERE status='failed' AND created_at >= ?", window24h);
    const totalJobs = count("SELECT COUNT(*) count FROM execution_jobs WHERE created_at >= ?", window24h);

    const executionInfrastructureErrors = {
      window: '24h',
      windowLabel: 'Last 24 hours',
      failures: infraErrors + failedJobs,
      attempts: { errors: infraErrors, total: totalAttempts },
      jobs: { errors: failedJobs, total: totalJobs },
    };

    const suspendedCount = count("SELECT COUNT(*) count FROM courses WHERE is_suspended=1");
    const suspendedItems = (this.db.prepare(`SELECT c.id,c.title,u.display_name ownerName FROM courses c LEFT JOIN users u ON u.id=c.owner_id WHERE c.is_suspended=1 ORDER BY c.updated_at DESC LIMIT 5`).all() as any[]).map((r) => ({ id: r.id, title: r.title, ownerName: r.ownerName ?? '' }));

    return {
      refreshedAt: new Date().toISOString(),
      suspendedCourses: { count: suspendedCount, items: suspendedItems },
      execution: { paused: ((this.db.prepare(`SELECT value FROM system_settings WHERE key='execution_paused'`).get() as any)?.value === 'true'), updatedAt: settings?.updated_at || null },
      queue: { queued: count("SELECT COUNT(*) count FROM execution_jobs WHERE status='queued'"), running: count("SELECT COUNT(*) count FROM execution_jobs WHERE status='running'"), oldestQueuedAt: oldest?.created_at || null },
      workers: { lastObservedAt: null, health: 'Unavailable: no separate worker heartbeat configured' },
      internalErrors: internalErrorRate.numerator,
      internalErrorRate,
      executionInfrastructureErrors,
      openReports: count("SELECT COUNT(*) count FROM reports WHERE status != 'resolved'"),
      emailDeliveryIssues: mail.issues || 0,
      email: { status: mail.issues ? 'Delivery issues recorded' : mail.pending ? 'Delivery pending' : mail.sent ? 'Recent delivery succeeded' : 'No delivery data', lastSentAt: mail.lastSentAt || null, total:mail.total||0 },
      telemetry: {
        queue: 'available',
        workerHeartbeat: 'not configured',
        email: mail.issues ? 'issues recorded' : mail.pending ? 'delivery pending' : mail.sent ? 'recent success' : 'no delivery data',
        internalErrorRate: internalErrorRate.status,
      },
    };
  }
  listExecutionJobs(adminId:string,from?:string,to?:string,limit=50,offset=0){this.requireAdmin(adminId);this.page(limit,offset);const where:string[]=['1=1'],args:any[]=[];if(from){where.push('created_at>=?');args.push(from);}if(to){where.push('created_at<=?');args.push(to);}const total=(this.db.prepare(`SELECT COUNT(*) count FROM execution_jobs WHERE ${where.join(' AND ')}`).get(...args) as any).count;const items=this.db.prepare(`SELECT id,user_id userId,enrollment_id enrollmentId,step_id stepId,job_type jobType,status,worker_id workerId,lease_expires_at leaseExpiresAt,created_at createdAt,updated_at updatedAt FROM execution_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args,limit,offset);return {items,total,limit,offset};}

  listUsers(adminId: string, options: { search?: string; status?: string; capability?: string; limit?: number; offset?: number } = {}) {
    this.requireAdmin(adminId); const limit = options.limit ?? 20; const offset = options.offset ?? 0; this.page(limit, offset);
    if (options.status && !['active','suspended','pending_deletion','purged'].includes(options.status)) throw new ValidationError('Invalid account status.');
    if (options.search && options.search.length > 100) throw new ValidationError('Search is too long.');
    const where: string[] = ['1=1']; const args: any[] = [];
    if (options.search?.trim()) { where.push('(LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)'); args.push(`%${options.search.trim().toLowerCase()}%`,`%${options.search.trim().toLowerCase()}%`); }
    if (options.status) { where.push('account_status = ?'); args.push(options.status); }
    if (options.capability && !['student','author','admin'].includes(options.capability)) throw new ValidationError('Invalid capability filter.');
    if (options.capability) { where.push('capabilities LIKE ?'); args.push(`%"${options.capability}"%`); }
    const total = (this.db.prepare(`SELECT COUNT(*) count FROM users WHERE ${where.join(' AND ')}`).get(...args) as any).count;
    const users = this.db.prepare(`SELECT id, email, display_name, email_verified, capabilities, account_status, created_at FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args,limit,offset) as any[];
    return { items: users.map((u) => ({ id:u.id,email:u.email,displayName:u.display_name,emailVerified:Boolean(u.email_verified),capabilities:JSON.parse(u.capabilities),accountStatus:u.account_status,createdAt:u.created_at })), total, limit, offset };
  }

  getUserDetail(adminId: string, userId: string) {
    this.requireAdmin(adminId);
    const user = this.db.prepare('SELECT id,email,display_name,email_verified,capabilities,account_status,created_at,updated_at FROM users WHERE id=?').get(userId) as any;
    if (!user) throw new NotFoundError("This page isn't available.");
    const privacyRequests = this.db.prepare('SELECT id,request_type, status,blocker_reason,created_at,updated_at FROM privacy_requests WHERE user_id=? ORDER BY created_at DESC').all(userId);
    const ownedCourses = this.db.prepare('SELECT id,title,publication_status,is_suspended FROM courses WHERE owner_id=?').all(userId);
    const enrollments = this.db.prepare(`SELECT e.id enrollmentId,e.course_id courseId,c.title,c.current_version_id currentVersionId,e.pinned_version_id pinnedVersionId,e.status FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.created_at DESC`).all(userId);
    return { user: { id:user.id,email:user.email,displayName:user.display_name,emailVerified:Boolean(user.email_verified),capabilities:JSON.parse(user.capabilities),accountStatus:user.account_status,createdAt:user.created_at,updatedAt:user.updated_at }, privacyRequests, ownedCourses, enrollments };
  }

  changeUserState(adminId: string, userId: string, action: 'grant_author'|'revoke_author'|'suspend'|'restore', reason: string) {
    this.requireAdmin(adminId); const why = this.reason(reason);
    const row = this.db.prepare('SELECT capabilities,account_status FROM users WHERE id=?').get(userId) as any;
    if (!row) throw new NotFoundError("This page isn't available.");
    if (adminId === userId && (action === 'revoke_author' || action === 'suspend')) throw new ConflictError('You cannot remove your own active administrator access.');
    const caps: string[] = JSON.parse(row.capabilities);
    if (action === 'grant_author' && !caps.includes('author')) caps.push('author');
    if (action === 'revoke_author') {
      const next = caps.filter((c) => c !== 'author');
      this.db.prepare('UPDATE users SET capabilities=?,updated_at=? WHERE id=?').run(JSON.stringify(next),new Date().toISOString(),userId);
      this.db.prepare('UPDATE author_access_tokens SET is_revoked=1 WHERE author_id=?').run(userId);
    } else if (action === 'grant_author') this.db.prepare('UPDATE users SET capabilities=?,updated_at=? WHERE id=?').run(JSON.stringify(caps),new Date().toISOString(),userId);
    else this.db.prepare('UPDATE users SET account_status=?,updated_at=? WHERE id=?').run(action === 'suspend' ? 'suspended':'active',new Date().toISOString(),userId);
    this.audit(adminId, `user:${action}`, 'user', userId, why);
    return this.getUserDetail(adminId,userId);
  }

  beginSupportAccess(adminId: string, userId: string, courseId: string, reason: string) {
    this.requireAdmin(adminId); const why = this.reason(reason);
    const enrollment = this.db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(userId,courseId);
    if (!enrollment) throw new NotFoundError("This page isn't available.");
    const id = crypto.randomUUID(), createdAt = new Date().toISOString(), expiresAt = new Date(Date.now()+30*60*1000).toISOString();
    this.db.prepare('INSERT INTO admin_support_access (id,admin_id,student_id,course_id,reason,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(id,adminId,userId,courseId,why,createdAt,expiresAt);
    this.audit(adminId,'support:access_granted','enrollment', (enrollment as any).id,why,{courseId,userId,expiresAt});
    return { id, userId, courseId, reason:why, createdAt, expiresAt };
  }
  getSupportedStudentRecords(adminId:string,grantId:string){this.requireAdmin(adminId);const grant=this.db.prepare(`SELECT * FROM admin_support_access WHERE id=? AND admin_id=? AND revoked_at IS NULL AND expires_at>?`).get(grantId,adminId,new Date().toISOString()) as any;if(!grant)throw new NotFoundError("This page isn't available.");const user=this.db.prepare('SELECT id,display_name FROM users WHERE id=?').get(grant.student_id) as any;const course=this.db.prepare('SELECT id,title FROM courses WHERE id=?').get(grant.course_id) as any;const enrollments=this.db.prepare(`SELECT e.id,e.status,e.pinned_version_id,cv.version_number FROM enrollments e JOIN course_versions cv ON cv.id=e.pinned_version_id WHERE e.user_id=? AND e.course_id=?`).all(grant.student_id,grant.course_id) as any[];const records=enrollments.map(e=>({enrollmentId:e.id,status:e.status,versionNumber:e.version_number,progress:this.db.prepare(`SELECT sp.step_id stepId,s.title,sp.is_completed isCompleted,sp.completed_at completedAt,sp.is_waived isWaived,sp.waiver_reason waiverReason FROM step_progress sp LEFT JOIN steps s ON s.id=sp.step_id WHERE sp.enrollment_id=?`).all(e.id),attempts:this.db.prepare(`SELECT id,step_id stepId,attempt_number attemptNumber,type,verdict,is_infrastructure_failure isInfrastructureFailure,created_at createdAt FROM assessment_attempts WHERE enrollment_id=? ORDER BY created_at DESC LIMIT 20`).all(e.id)}));this.audit(adminId,'support:records_viewed','user',grant.student_id,grant.reason,{courseId:grant.course_id,grantId});return {support:{grantId,reason:this.sanitizeReason(String(grant.reason||'')),expiresAt:grant.expires_at},student:{id:user.id,displayName:user.display_name},course,enrollments:records};}
  revokeSupportAccess(adminId:string,grantId:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const grant=this.db.prepare('SELECT id,student_id,course_id FROM admin_support_access WHERE id=? AND admin_id=? AND revoked_at IS NULL').get(grantId,adminId) as any;if(!grant)throw new NotFoundError("This page isn't available.");const now=new Date().toISOString();this.db.prepare('UPDATE admin_support_access SET revoked_at=? WHERE id=?').run(now,grantId);this.audit(adminId,'support:access_revoked','user',grant.student_id,why,{courseId:grant.course_id,grantId});return {revoked:true,revokedAt:now};}

}
