import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ConflictError, NotFoundError, ValidationError, AuthorizationError } from 'zur-shared';

export class AdminService {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db=db; }

  private requireAdmin(adminId: string): void {
    const row = this.db.prepare('SELECT capabilities, account_status FROM users WHERE id = ?').get(adminId) as any;
    if (!row || row.account_status !== 'active' || !(JSON.parse(row.capabilities || '[]') as string[]).includes('admin')) {
      throw new NotFoundError("This page isn't available.");
    }
  }

  private page(limit: number, offset: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('Invalid pagination.');
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private sanitizeReason(value: string) {
    let clean = value.replace(/```[\s\S]*?```/g, '[redacted code]');
    if (/(^|\n)\s*(?:const|let|var|function|class|import|from|def|return|SELECT|INSERT|UPDATE|DELETE)\b/m.test(clean)
      || /`[^`]+`/.test(clean)
      || /\bprint\s*\(/i.test(clean)
      || /\b[A-Za-z_$][\w$]*\s*=\s*(?:[-+]?\d|["'`{[]|true\b|false\b|null\b|None\b|\w+\s*\()/i.test(clean)) {
      return '[reason redacted because it contained code]';
    }
    clean = clean
      .replace(/\b(?:api[-_ ]?token|password|passwd|secret|token|api[-_ ]?key|credential|authorization)\b\s*[:=]?\s*[^\s,;]+/gi, '[redacted credential]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
      .replace(/https?:\/\/[^\s]+/gi, '[redacted URL]')
      .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])-[_A-Za-z0-9-]{8,}\b/gi, '[redacted token]');
    return clean;
  }

  private reason(reason: string) {
    const clean = typeof reason === 'string' ? reason.trim() : '';
    if (clean.length < 8 || clean.length > 1000) throw new ValidationError('Provide a reason between 8 and 1000 characters.');
    return this.sanitizeReason(clean);
  }

  private audit(actorId: string, action: string, targetType: string, targetId: string, reason: string, metadata?: Record<string, unknown>) {
    this.db.prepare(`INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, metadata, correlation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), actorId, action, targetType, targetId,
      this.sanitizeReason(this.reason(reason)), metadata ? JSON.stringify(metadata) : null, crypto.randomUUID(), new Date().toISOString());
  }

  getOperationsOverview(adminId: string) {
    this.requireAdmin(adminId);
    const count = (sql: string, ...args: any[]) => (this.db.prepare(sql).get(...args) as any)?.count ?? 0;
    const oldest = this.db.prepare(`SELECT created_at FROM execution_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1`).get() as any;
    const settings = this.db.prepare(`SELECT updated_at FROM system_settings WHERE key = 'execution_paused'`).get() as any;
    const mail = this.db.prepare(`SELECT COUNT(*) AS total,SUM(email_delivery_status='sent') AS sent,SUM(email_delivery_status='pending') AS pending,COUNT(*) FILTER (WHERE email_delivery_status IN ('failed','not_configured')) AS issues,MAX(email_sent_at) AS lastSentAt FROM invitations WHERE type='email'`).get() as any;
    return {
      refreshedAt: new Date().toISOString(),
      execution: { paused: ((this.db.prepare(`SELECT value FROM system_settings WHERE key='execution_paused'`).get() as any)?.value === 'true'), updatedAt: settings?.updated_at || null },
      queue: { queued: count("SELECT COUNT(*) count FROM execution_jobs WHERE status='queued'"), running: count("SELECT COUNT(*) count FROM execution_jobs WHERE status='running'"), oldestQueuedAt: oldest?.created_at || null },
      workers: { lastObservedAt: null, health: 'Unavailable — no separate worker heartbeat configured' },
      internalErrors: count("SELECT COUNT(*) count FROM assessment_attempts WHERE is_infrastructure_failure=1 AND created_at >= ?", new Date(Date.now()-86400000).toISOString()),
      openReports: count("SELECT COUNT(*) count FROM reports WHERE status != 'resolved'"),
      emailDeliveryIssues: mail.issues || 0,
      email: { status: mail.issues ? 'Delivery issues recorded' : mail.pending ? 'Delivery pending' : mail.sent ? 'Recent delivery succeeded' : 'No delivery data', lastSentAt: mail.lastSentAt || null, total:mail.total||0 },
      telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: mail.issues ? 'issues recorded' : mail.pending ? 'delivery pending' : mail.sent ? 'recent success' : 'no delivery data' },
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

  listCourses(adminId: string, search = '', limit=20, offset=0) {
    this.requireAdmin(adminId); this.page(limit,offset); if (search.length>100) throw new ValidationError('Search is too long.');
    const where = search.trim() ? 'WHERE LOWER(c.title) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.display_name) LIKE ?' : '';
    const args = search.trim() ? [`%${search.trim().toLowerCase()}%`,`%${search.trim().toLowerCase()}%`,`%${search.trim().toLowerCase()}%`] : [];
    const total = (this.db.prepare(`SELECT COUNT(*) count FROM courses c JOIN users u ON u.id=c.owner_id ${where}`).get(...args) as any).count;
    const items = this.db.prepare(`SELECT c.id,c.title,c.publication_status,c.visibility,c.is_suspended,c.current_version_id,u.id owner_id,u.display_name owner_name,
      (SELECT version_number FROM course_versions WHERE id=c.current_version_id) latest_version,
      (SELECT COUNT(*) FROM reports r WHERE r.course_id=c.id AND r.status!='resolved') open_reports
      FROM courses c JOIN users u ON u.id=c.owner_id ${where} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`).all(...args,limit,offset);
    return { items,total,limit,offset };
  }
  getCourseDetail(adminId:string,courseId:string){this.requireAdmin(adminId);const row=this.db.prepare(`SELECT c.id,c.title,c.description,c.publication_status publicationStatus,c.visibility,c.enrollment_policy enrollmentPolicy,c.is_suspended isSuspended,c.current_version_id currentVersionId,c.owner_id ownerId,u.display_name ownerName,u.email ownerEmail,u.account_status ownerAccountStatus,EXISTS(SELECT 1 FROM privacy_requests p WHERE p.user_id=u.id AND p.request_type='deletion' AND p.status IN ('submitted','pending')) ownerDeletionPending,(SELECT version_number FROM course_versions WHERE id=c.current_version_id) latestVersion,(SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.status='active') activeEnrollments,(SELECT COUNT(*) FROM reports r WHERE r.course_id=c.id AND r.status!='resolved') openReports FROM courses c JOIN users u ON u.id=c.owner_id WHERE c.id=?`).get(courseId) as any;if(!row)throw new NotFoundError("This page isn't available.");row.ownerDeletionPending=Boolean(row.ownerDeletionPending);row.versions=(this.db.prepare('SELECT id,version_number versionNumber,created_at createdAt,snapshot_data FROM course_versions WHERE course_id=? ORDER BY version_number DESC').all(courseId) as any[]).map(v=>({id:v.id,versionNumber:v.versionNumber,createdAt:v.createdAt,steps:(JSON.parse(v.snapshot_data).modules||[]).flatMap((m:any)=>m.lessons||[]).flatMap((l:any)=>l.steps||[]).map((s:any)=>({id:s.id,title:s.title,isRequired:Boolean(s.isRequired)}))}));return row;}
  setCourseSuspended(adminId:string,courseId:string,suspended:boolean,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const row=this.db.prepare('SELECT is_suspended FROM courses WHERE id=?').get(courseId) as any;if(!row)throw new NotFoundError("This page isn't available.");this.db.prepare('UPDATE courses SET is_suspended=?,updated_at=? WHERE id=?').run(suspended?1:0,new Date().toISOString(),courseId);this.audit(adminId,suspended?'course:suspend':'course:unsuspend','course',courseId,why);return this.getCourseDetail(adminId,courseId);}
  archiveCourseForDeletion(adminId:string,courseId:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const course=this.db.prepare(`SELECT c.owner_id,c.publication_status FROM courses c WHERE c.id=? AND EXISTS(SELECT 1 FROM privacy_requests p WHERE p.user_id=c.owner_id AND p.request_type='deletion' AND p.status IN ('submitted','pending'))`).get(courseId) as any;if(!course)throw new NotFoundError("This page isn't available.");if(course.publication_status==='archived')return this.getCourseDetail(adminId,courseId);this.db.prepare(`UPDATE courses SET publication_status='archived',updated_at=? WHERE id=?`).run(new Date().toISOString(),courseId);this.audit(adminId,'course:archive_for_deletion','course',courseId,why,{ownerId:course.owner_id});return this.getCourseDetail(adminId,courseId);}
  setExecutionPaused(adminId:string,paused:boolean,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const now=new Date().toISOString();this.db.prepare(`INSERT INTO system_settings(key,value,updated_at) VALUES('execution_paused',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(paused?'true':'false',now);this.audit(adminId,paused?'execution:disable_new':'execution:reactivate','execution','global',why);return {executionPaused:paused,updatedAt:now};}

  waiveStep(adminId: string, courseId: string, versionId: string, stepId: string, reason: string, enrollmentIds?: string[], reviewedAffectedCount?: number) {
    this.requireAdmin(adminId); const why = this.reason(reason);
    const course = this.db.prepare('SELECT id FROM courses WHERE id=?').get(courseId); if (!course) throw new NotFoundError("This page isn't available.");
    const v = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id=? AND course_id=?').get(versionId,courseId) as any;
    if (!v) throw new NotFoundError("This page isn't available.");
    const snapshot = JSON.parse(v.snapshot_data); const step = (snapshot.modules||[]).flatMap((m:any)=>m.lessons||[]).flatMap((l:any)=>l.steps||[]).find((s:any)=>s.id===stepId);
    if (!step || !step.isRequired) throw new ValidationError('Select a required step in the selected published version.');
    const params: any[]=[courseId,versionId];
    let sql="SELECT e.id,e.user_id FROM enrollments e WHERE e.course_id=? AND e.pinned_version_id=? AND e.status='active' AND NOT EXISTS (SELECT 1 FROM step_progress p WHERE p.enrollment_id=e.id AND p.step_id=? AND (p.is_completed=1 OR p.is_waived=1))";
    params.push(stepId);
    if (enrollmentIds?.length) { sql += ` AND id IN (${enrollmentIds.map(()=>'?').join(',')})`; params.push(...enrollmentIds); }
    const enrollments=this.db.prepare(sql).all(...params) as any[];
    if (!enrollments.length) throw new ValidationError('No active enrollments match this version and scope.');
    if(reviewedAffectedCount!==enrollments.length) throw new ConflictError('The affected enrollment count changed. Review the waiver again before applying it.');
    const now=new Date().toISOString();
    const run=()=>this.transaction(()=>{
      for (const e of enrollments) {
        this.db.prepare(`INSERT INTO step_progress (id,user_id,enrollment_id,step_id,is_completed,is_waived,waiver_reason,waived_by_id,created_at,updated_at)
          VALUES (?,?,?,?,0,1,?,?,?,?) ON CONFLICT(enrollment_id,step_id) DO UPDATE SET is_waived=1,waiver_reason=excluded.waiver_reason,waived_by_id=excluded.waived_by_id,updated_at=excluded.updated_at`)
          .run(crypto.randomUUID(),e.user_id,e.id,stepId,why,adminId,now,now);
      }
      this.audit(adminId,'course:waive_step','step',stepId,why,{courseId,versionId,enrollmentIds:enrollments.map(e=>e.id),affectedCount:enrollments.length});
    }); run(); return { affectedCount:enrollments.length, courseId,versionId,stepId,reason:why };
  }
  previewWaiver(adminId:string,courseId:string,versionId:string,stepId:string,enrollmentIds?:string[]){this.requireAdmin(adminId);const v=this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id=? AND course_id=?').get(versionId,courseId) as any;if(!v)throw new NotFoundError("This page isn't available.");const step=(JSON.parse(v.snapshot_data).modules||[]).flatMap((m:any)=>m.lessons||[]).flatMap((l:any)=>l.steps||[]).find((s:any)=>s.id===stepId);if(!step||!step.isRequired)throw new ValidationError('Select a required step in the selected published version.');const args:any[]=[courseId,versionId,stepId];let sql=`SELECT COUNT(*) count FROM enrollments e WHERE e.course_id=? AND e.pinned_version_id=? AND e.status='active' AND NOT EXISTS (SELECT 1 FROM step_progress p WHERE p.enrollment_id=e.id AND p.step_id=? AND (p.is_completed=1 OR p.is_waived=1))`;if(enrollmentIds?.length){sql+=` AND e.id IN (${enrollmentIds.map(()=>'?').join(',')})`;args.push(...enrollmentIds);}return {courseId,versionId,stepId,affectedCount:(this.db.prepare(sql).get(...args) as any).count,scope:enrollmentIds?.length?'selected active enrollments':'all active enrollments pinned to this version'};}

  listCategories(adminId: string) {
    this.requireAdmin(adminId); return this.db.prepare(`SELECT c.id,c.name,c.slug,c.created_at createdAt,COUNT(co.id) usageCount
      FROM categories c LEFT JOIN courses co ON co.category_id=c.id GROUP BY c.id ORDER BY LOWER(c.name)`).all();
  }
  saveCategory(adminId: string, name: string, categoryId?: string, replacementCategoryId?: string, reason='Category maintenance') {
    this.requireAdmin(adminId); const clean=name.trim().normalize('NFKC').replace(/\s+/g,' ');
    if(clean.length<2||clean.length>60) throw new ValidationError('Category name must be 2–60 characters.');
    const existing=this.db.prepare('SELECT id FROM categories WHERE LOWER(name)=LOWER(?) AND id != ?').get(clean,categoryId||'') as any;
    if(existing) throw new ConflictError('A category with this name already exists.');
    const slug=clean.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(categoryId){ this.db.prepare('UPDATE categories SET name=?,slug=? WHERE id=?').run(clean,slug,categoryId); this.audit(adminId,'category:rename','category',categoryId,reason,{name:clean}); return {id:categoryId,name:clean,slug}; }
    const id=crypto.randomUUID(); this.db.prepare('INSERT INTO categories(id,name,slug) VALUES(?,?,?)').run(id,clean,slug); this.audit(adminId,'category:create','category',id,reason,{name:clean}); return {id,name:clean,slug};
  }
  removeCategory(adminId: string, id: string, replacementId?: string, reason='Category removal and reassignment') {
    this.requireAdmin(adminId); const cat=this.db.prepare('SELECT id FROM categories WHERE id=?').get(id); if(!cat) throw new NotFoundError("This page isn't available.");
    const usage=(this.db.prepare('SELECT COUNT(*) count FROM courses WHERE category_id=?').get(id) as any).count;
    if(usage && !replacementId) throw new ConflictError('This category is in use. Choose a replacement category first.');
    if(replacementId){ if(replacementId===id||!this.db.prepare('SELECT id FROM categories WHERE id=?').get(replacementId)) throw new ValidationError('Choose another existing category.'); }
    this.transaction(()=>{ if(usage) this.db.prepare('UPDATE courses SET category_id=?,updated_at=? WHERE category_id=?').run(replacementId,new Date().toISOString(),id); this.db.prepare('DELETE FROM categories WHERE id=?').run(id); this.audit(adminId,'category:remove','category',id,reason,{usage,replacementId:replacementId||null}); });
    return {success:true,reassigned:usage};
  }

  listReports(adminId: string,status?:string,limit=20,offset=0){
    this.requireAdmin(adminId); this.page(limit,offset); if(status&&!['open','investigating','resolved'].includes(status))throw new ValidationError('Invalid report status.');
    const where=status?'WHERE r.status=?':'';const args=status?[status]:[];
    const total=(this.db.prepare(`SELECT COUNT(*) count FROM reports r ${where}`).get(...args) as any).count;
    const items=this.db.prepare(`SELECT r.id,r.type,r.status,r.description,r.course_id courseId,r.course_version_id courseVersionId,r.step_id stepId,r.created_at createdAt,u.display_name reporterName,c.title courseTitle
      FROM reports r JOIN users u ON u.id=r.reporter_id JOIN courses c ON c.id=r.course_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).all(...args,limit,offset);
    return {items,total,limit,offset};
  }
  getReport(adminId:string,id:string){this.requireAdmin(adminId);const report=this.db.prepare(`SELECT r.id,r.type,r.status,r.description,r.submitted_code submittedCode,r.course_id courseId,r.course_version_id courseVersionId,r.step_id stepId,r.resolution_notes resolutionNotes,r.resolution_outcome resolutionOutcome,r.internal_notes internalNotes,r.created_at createdAt,u.display_name reporterName,c.title courseTitle FROM reports r JOIN users u ON u.id=r.reporter_id JOIN courses c ON c.id=r.course_id WHERE r.id=?`).get(id);if(!report)throw new NotFoundError("This page isn't available.");return report;}
  updateReport(adminId:string,id:string,status:string,outcome:string,internalNotes:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);if(!['open','investigating','resolved'].includes(status))throw new ValidationError('Invalid report status.');if(status==='resolved'&&(!outcome.trim()||outcome.trim().length>2000))throw new ValidationError('A resolution outcome is required.');if(internalNotes.length>4000)throw new ValidationError('Internal notes are too long.');const now=new Date().toISOString();const res=this.db.prepare('UPDATE reports SET status=?,resolution_outcome=?,internal_notes=?,resolution_notes=?,resolved_by=?,updated_at=? WHERE id=?').run(status,status==='resolved'?outcome.trim():null,internalNotes.trim()||null,status==='resolved'?outcome.trim():null,status==='resolved'?adminId:null,now,id);if(!res.changes)throw new NotFoundError("This page isn't available.");this.audit(adminId,'report:status','report',id,why,{status});return this.getReport(adminId,id);}

  listMedia(adminId:string,limit=20,offset=0){this.requireAdmin(adminId);this.page(limit,offset);const total=(this.db.prepare('SELECT COUNT(*) count FROM media_assets').get() as any).count;const items=this.db.prepare(`SELECT a.id,a.course_id courseId,c.title courseTitle,a.uploader_id uploaderId,a.file_size fileSize,a.mime_type mimeType,a.dimensions,a.alt_text altText,a.is_decorative isDecorative,a.caption,a.processing_status processingStatus,a.created_at createdAt,a.updated_at updatedAt FROM media_assets a JOIN courses c ON c.id=a.course_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(limit,offset) as any[];return {items:items.map(a=>{const versions=(this.db.prepare('SELECT snapshot_data FROM course_versions WHERE course_id=?').all(a.courseId) as any[]).filter(v=>String(v.snapshot_data).includes(a.id)).length;const drafts=(this.db.prepare(`SELECT COUNT(*) count FROM step_contents sc JOIN steps s ON s.id=sc.step_id JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND sc.content_payload LIKE ?`).get(a.courseId,`%${a.id}%`) as any).count;return {...a,dimensions:a.dimensions?JSON.parse(a.dimensions):null,isDecorative:Boolean(a.isDecorative),referenceCount:versions+drafts};}),total,limit,offset};}
  reviewMedia(adminId:string,id:string,action:'quarantine'|'restore',reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const row=this.db.prepare('SELECT id,processing_status FROM media_assets WHERE id=?').get(id) as any;if(!row)throw new NotFoundError("This page isn't available.");const status=action==='quarantine'?'quarantined':'ready';this.db.prepare('UPDATE media_assets SET processing_status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),id);this.audit(adminId,`media:${action}`,'media',id,why,{previousStatus:row.processing_status,status});return {id,processingStatus:status};}
  deleteMedia(adminId:string,id:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const asset=this.db.prepare('SELECT id,course_id,processing_status,file_path FROM media_assets WHERE id=?').get(id) as any;if(!asset)throw new NotFoundError("This page isn't available.");if(asset.processing_status!=='quarantined')throw new ConflictError('Quarantine the asset before deletion.');const needle=`%${id}%`;const published=(this.db.prepare('SELECT COUNT(*) count FROM course_versions WHERE course_id=? AND snapshot_data LIKE ?').get(asset.course_id,needle) as any).count;const draft=(this.db.prepare(`SELECT COUNT(*) count FROM step_contents sc JOIN steps s ON s.id=sc.step_id JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND sc.content_payload LIKE ?`).get(asset.course_id,needle) as any).count;const references=published+draft;if(references)throw new ConflictError(`This asset is referenced by ${references} retained course record(s) and cannot be deleted.`);this.transaction(()=>{this.db.prepare('DELETE FROM media_assets WHERE id=?').run(id);this.audit(adminId,'media:delete','media',id,why,{courseId:asset.course_id,referenceCount:references});});if(fs.existsSync(asset.file_path))fs.unlinkSync(asset.file_path);return {deleted:true,id,referenceCount:references};}
  authorizeMediaPreview(adminId:string,id:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const asset=this.db.prepare('SELECT id,processing_status FROM media_assets WHERE id=?').get(id) as any;if(!asset||asset.processing_status!=='ready')throw new NotFoundError("This page isn't available.");this.audit(adminId,'media:preview','media',id,why,{processingStatus:asset.processing_status});return {authorized:true};}

  listAudit(adminId:string,options:{actorId?:string;action?:string;targetType?:string;targetId?:string;reason?:string;correlationId?:string;from?:string;to?:string;limit?:number;offset?:number}={}){this.requireAdmin(adminId);const limit=options.limit??50,offset=options.offset??0;this.page(limit,offset);const makeWhere=(alias:string,agent=false)=>{const where:string[]=['1=1'],args:any[]=[];const col=(name:string)=>`${alias}.${name}`;if(options.actorId){where.push(`${col(agent?'author_id':'actor_id')}=?`);args.push(options.actorId);}if(options.action){if(agent){where.push(`${col('tool_name')}=?`);args.push(options.action.replace(/^agent:/,''));}else{where.push(`${col('action')}=?`);args.push(options.action);}}if(options.targetType&&(!agent||options.targetType!=='course')){where.push(agent?'1=0':`${col('target_type')}=?`);if(!agent)args.push(options.targetType);}if(options.targetId){where.push(`${col(agent?'course_id':'target_id')}=?`);args.push(options.targetId);}if(options.reason){if(agent)where.push('1=0');else{where.push(`${col('reason')} LIKE ?`);args.push(`%${options.reason.slice(0,100)}%`);}}if(options.correlationId){where.push(`${col('correlation_id')}=?`);args.push(options.correlationId);}if(options.from){where.push(`${col('created_at')}>=?`);args.push(options.from);}if(options.to){where.push(`${col('created_at')}<=?`);args.push(/^\d{4}-\d{2}-\d{2}$/.test(options.to)?`${options.to}T23:59:59.999Z`:options.to);}return {where:where.join(' AND '),args};};const aw=makeWhere('a'),mw=makeWhere('m',true);const totalAudit=(this.db.prepare(`SELECT COUNT(*) count FROM audit_events a WHERE ${aw.where}`).get(...aw.args) as any).count;const totalAgents=(this.db.prepare(`SELECT COUNT(*) count FROM agent_mutations m WHERE ${mw.where}`).get(...mw.args) as any).count;const take=offset+limit;const auditRows=this.db.prepare(`SELECT a.id,a.actor_id actorId,u.display_name actorName,a.action,a.target_type targetType,a.target_id targetId,a.reason,a.correlation_id correlationId,a.created_at createdAt,'audit' source FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE ${aw.where} ORDER BY a.created_at DESC LIMIT ?`).all(...aw.args,take) as any[];const agentRows=this.db.prepare(`SELECT m.id,m.author_id actorId,u.display_name actorName,('agent:'||m.tool_name) action,'course' targetType,m.course_id targetId,c.title targetTitle,'Agent mutation' reason,m.correlation_id correlationId,m.created_at createdAt,'agent' source FROM agent_mutations m JOIN users u ON u.id=m.author_id JOIN courses c ON c.id=m.course_id WHERE ${mw.where} ORDER BY m.created_at DESC LIMIT ?`).all(...mw.args,take) as any[];const merged=[...auditRows,...agentRows].map(row=>({...row,reason:this.sanitizeReason(String(row.reason||''))})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(a.id).localeCompare(String(b.id)));return {items:merged.slice(offset,offset+limit),total:totalAudit+totalAgents,limit,offset};}
  getAuditEvent(adminId:string,id:string){this.requireAdmin(adminId);const row=this.db.prepare(`SELECT a.id,a.actor_id actorId,u.display_name actorName,a.action,a.target_type targetType,a.target_id targetId,a.reason,a.metadata,a.correlation_id correlationId,a.created_at createdAt,'audit' source FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.id=?`).get(id) as any;if(!row){const agent=this.db.prepare(`SELECT m.id,m.author_id actorId,u.display_name actorName,('agent:'||m.tool_name) action,'course' targetType,m.course_id targetId,c.title targetTitle,m.base_revision baseRevision,m.new_revision newRevision,m.affected_entities affectedEntities,m.outcome,m.correlation_id correlationId,m.created_at createdAt,'agent' source FROM agent_mutations m JOIN users u ON u.id=m.author_id JOIN courses c ON c.id=m.course_id WHERE m.id=?`).get(id) as any;if(!agent)throw new NotFoundError("This page isn't available.");try{agent.affectedEntities=JSON.parse(agent.affectedEntities);}catch{agent.affectedEntities=[];}return agent;}const hidden=/password|secret|token|code|stdout|stderr|input|output|test|email|signed.?url|credential/i;const clean=(value:any):any=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!hidden.test(key)).map(([key,v])=>[key,clean(v)]));if(typeof value==='string'&&/https?:\/\/[^\s]*(?:token|signature|x-amz-)/i.test(value))return '[redacted]';return value;};let metadata=null;try{metadata=row.metadata?clean(JSON.parse(row.metadata)):null;}catch{metadata='[unavailable]';}return {...row,reason:this.sanitizeReason(String(row.reason||'')),metadata};}

  listPrivacyRequests(adminId:string,status?:string,limit=20,offset=0){this.requireAdmin(adminId);this.page(limit,offset);if(status&&!['submitted','pending','completed','failed'].includes(status))throw new ValidationError('Invalid privacy-request status.');const where=status?'WHERE p.status=?':'';const args=status?[status]:[];const total=(this.db.prepare(`SELECT COUNT(*) count FROM privacy_requests p ${where}`).get(...args) as any).count;const items=this.db.prepare(`SELECT p.id,p.user_id userId,p.request_type requestType,p.status,p.blocker_reason blockerReason,p.created_at createdAt,p.updated_at updatedAt,u.display_name displayName,u.email FROM privacy_requests p JOIN users u ON u.id=p.user_id ${where} ORDER BY p.created_at ASC LIMIT ? OFFSET ?`).all(...args,limit,offset);return {items,total,limit,offset};}
  updatePrivacyRequest(adminId:string,id:string,status:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);if(!['pending','completed','failed'].includes(status))throw new ValidationError('Invalid privacy-request status.');const req=this.db.prepare('SELECT user_id,request_type FROM privacy_requests WHERE id=?').get(id) as any;if(!req)throw new NotFoundError("This page isn't available.");if(status==='completed')throw new ConflictError(req.request_type==='deletion'?'Use the account purge action after ownership and retention checks.':'Create and deliver the export package before completing this request.');this.db.prepare('UPDATE privacy_requests SET status=?,blocker_reason=?,updated_at=? WHERE id=?').run(status,status==='failed'?why:null,new Date().toISOString(),id);this.audit(adminId,'privacy_request:status','privacy_request',id,why,{status,requestType:req.request_type});return {id,status};}
  exportAccount(adminId:string,requestId:string,reason:string){
    this.requireAdmin(adminId);const why=this.reason(reason);
    const request=this.db.prepare(`SELECT p.user_id,p.request_type,p.status,u.email,u.display_name,u.email_verified,u.account_status,u.created_at FROM privacy_requests p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(requestId) as any;
    if(!request||request.request_type!=='export'||!['pending','submitted'].includes(request.status))throw new NotFoundError("This page isn't available.");
    const userId=request.user_id;
    const enrollments=this.db.prepare(`SELECT e.id,e.course_id,e.pinned_version_id,e.status,e.created_at,c.title course_title FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.created_at`).all(userId) as any[];
    const packageData={
      schemaVersion:1,generatedAt:new Date().toISOString(),privacyRequestId:requestId,
      profile:{email:request.email,displayName:request.display_name,emailVerified:Boolean(request.email_verified),accountStatus:request.account_status,createdAt:request.created_at},
      enrollments:enrollments.map(e=>({enrollmentId:e.id,courseId:e.course_id,courseTitle:e.course_title,pinnedVersionId:e.pinned_version_id,status:e.status,createdAt:e.created_at,
        progress:this.db.prepare(`SELECT step_id stepId,is_completed isCompleted,completed_at completedAt,is_waived isWaived,waiver_reason waiverReason,created_at createdAt,updated_at updatedAt FROM step_progress WHERE enrollment_id=?`).all(e.id),
        attempts:this.db.prepare(`SELECT id,step_id stepId,course_version_id courseVersionId,attempt_number attemptNumber,type,verdict,code_snapshot codeSnapshot,selected_options selectedOptions,execution_time_ms executionTimeMs,is_infrastructure_failure isInfrastructureFailure,created_at createdAt FROM assessment_attempts WHERE enrollment_id=? ORDER BY created_at`).all(e.id)})),
      codeDrafts:this.db.prepare(`SELECT d.enrollment_id enrollmentId,d.step_id stepId,d.code,d.revision,d.updated_at updatedAt FROM code_drafts d WHERE d.user_id=? ORDER BY d.updated_at DESC`).all(userId),
      reports:this.db.prepare(`SELECT r.id,r.course_id courseId,c.title courseTitle,r.course_version_id courseVersionId,r.step_id stepId,r.type,r.description,r.submitted_code submittedCode,r.status,r.resolution_outcome resolutionOutcome,r.created_at createdAt FROM reports r JOIN courses c ON c.id=r.course_id WHERE r.reporter_id=? ORDER BY r.created_at`).all(userId),
      authoredCourses:this.db.prepare(`SELECT id,title,visibility,publication_status publicationStatus,current_version_id currentVersionId,created_at createdAt,updated_at updatedAt FROM courses WHERE owner_id=? ORDER BY created_at`).all(userId),
      authorAccess:this.db.prepare(`SELECT id,label,scopes,course_restrictions courseRestrictions,expires_at expiresAt,is_revoked isRevoked,last_used_at lastUsedAt,created_at createdAt FROM author_access_tokens WHERE author_id=? ORDER BY created_at`).all(userId),
      invitationRecords:this.db.prepare(`SELECT id,course_id courseId,recipient_email recipientEmail,type,max_uses maxUses,uses_count usesCount,expires_at expiresAt,is_revoked isRevoked,email_delivery_status emailDeliveryStatus,email_sent_at emailSentAt,created_at createdAt FROM invitations WHERE inviter_id=? ORDER BY created_at`).all(userId),
      agentActivity:this.db.prepare(`SELECT id,course_id courseId,tool_name toolName,base_revision baseRevision,new_revision newRevision,affected_entities affectedEntities,outcome,correlation_id correlationId,created_at createdAt FROM agent_mutations WHERE author_id=? ORDER BY created_at`).all(userId),
      privacyRequests:this.db.prepare(`SELECT id,request_type requestType,status,blocker_reason blockerReason,created_at createdAt,updated_at updatedAt FROM privacy_requests WHERE user_id=? ORDER BY created_at`).all(userId),
    };
    for(const mutation of packageData.agentActivity as any[]){try{mutation.affectedEntities=JSON.parse(mutation.affectedEntities);}catch{mutation.affectedEntities=[];}}
    const now=new Date().toISOString(),expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    this.transaction(()=>{this.db.prepare(`INSERT INTO privacy_exports(request_id,user_id,package_json,expires_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET package_json=excluded.package_json,expires_at=excluded.expires_at,created_at=excluded.created_at,downloaded_at=NULL,download_count=0`).run(requestId,userId,JSON.stringify(packageData),expiresAt,now);this.db.prepare(`UPDATE privacy_requests SET status='completed',blocker_reason=NULL,updated_at=? WHERE id=?`).run(now,requestId);this.audit(adminId,'privacy_request:export','user',userId,why,{requestId,recordCount:enrollments.length,expiresAt});});return {requestId,status:'completed',expiresAt,downloadUrl:`/api/settings/privacy/exports/${encodeURIComponent(requestId)}`};
  }
  purgeAccount(adminId:string,requestId:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const request=this.db.prepare(`SELECT p.user_id,p.request_type,p.status,p.created_at,u.email,u.account_status FROM privacy_requests p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(requestId) as any;if(!request||request.request_type!=='deletion'||!['pending','submitted'].includes(request.status))throw new NotFoundError("This page isn't available.");if(Date.now()-Date.parse(request.created_at)<30*86400000)throw new ConflictError('The 30-day deletion review period has not elapsed.');const owned=(this.db.prepare(`SELECT id,title FROM courses WHERE owner_id=? AND publication_status!='archived'`).all(request.user_id) as any[]);if(owned.length){const blocker='Account deletion is blocked until owned courses are transferred or archived.';this.db.prepare('UPDATE privacy_requests SET blocker_reason=?,updated_at=? WHERE id=?').run(blocker,new Date().toISOString(),requestId);this.audit(adminId,'privacy_request:deletion_blocked','user',request.user_id,why,{requestId,courseIds:owned.map(c=>c.id)});throw new ConflictError(blocker);}const now=new Date().toISOString(),emailHash=crypto.createHash('sha256').update(request.email).digest('hex'),replacement=`deleted-${crypto.randomUUID()}@purged.invalid`;this.transaction(()=>{this.db.prepare('UPDATE invitations SET is_revoked=1 WHERE LOWER(recipient_email)=LOWER(?)').run(request.email);this.db.prepare('UPDATE invitations SET recipient_email=NULL WHERE LOWER(recipient_email)=LOWER(?)').run(request.email);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(request.user_id);this.db.prepare('DELETE FROM verification_tokens WHERE user_id=?').run(request.user_id);this.db.prepare('DELETE FROM code_drafts WHERE user_id=?').run(request.user_id);this.db.prepare('UPDATE author_access_tokens SET is_revoked=1 WHERE author_id=?').run(request.user_id);this.db.prepare(`UPDATE users SET email=?,display_name='Deleted learner',password_hash='',email_verified=0,capabilities='["student"]',account_status='purged',updated_at=? WHERE id=?`).run(replacement,now,request.user_id);this.db.prepare(`INSERT INTO deletion_registry(id,user_id,email_hash,requested_at,purged_at) VALUES(?,?,?,?,?)`).run(crypto.randomUUID(),request.user_id,emailHash,request.created_at,now);this.db.prepare(`UPDATE privacy_requests SET status='completed',blocker_reason=NULL,updated_at=? WHERE id=?`).run(now,requestId);this.audit(adminId,'privacy_request:purge','user',request.user_id,why,{requestId,backupRedactionRequired:true});});return {requestId,status:'completed',purgedAt:now,backupRedactionRequired:true};}
}
