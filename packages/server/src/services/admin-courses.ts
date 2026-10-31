import crypto from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from 'zur-shared';
import { AdminUsersOperations } from './admin-users-operations.ts';

export class AdminCourses extends AdminUsersOperations {
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
  getCourseDetail(adminId:string,courseId:string){
    this.requireAdmin(adminId);
    const row=this.db.prepare(`SELECT c.id,c.title,c.description,c.publication_status publicationStatus,c.visibility,c.enrollment_policy enrollmentPolicy,c.is_suspended isSuspended,c.current_version_id currentVersionId,c.owner_id ownerId,u.display_name ownerName,u.email ownerEmail,u.account_status ownerAccountStatus,EXISTS(SELECT 1 FROM privacy_requests p WHERE p.user_id=u.id AND p.request_type='deletion' AND p.status IN ('submitted','pending')) ownerDeletionPending,(SELECT version_number FROM course_versions WHERE id=c.current_version_id) latestVersion,(SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.status='active') activeEnrollments,(SELECT COUNT(*) FROM reports r WHERE r.course_id=c.id AND r.status!='resolved') openReports FROM courses c JOIN users u ON u.id=c.owner_id WHERE c.id=?`).get(courseId) as any;
    if(!row)throw new NotFoundError("This page isn't available.");
    row.ownerDeletionPending=Boolean(row.ownerDeletionPending);
    row.versions=(this.db.prepare('SELECT id,version_number versionNumber,created_at createdAt,snapshot_data FROM course_versions WHERE course_id=? ORDER BY version_number DESC').all(courseId) as any[]).map(v=>{
      let parsed: any = {};
      try { parsed = JSON.parse(v.snapshot_data); } catch {}
      const steps: any[] = [];
      for (const m of parsed.modules || []) {
        for (const l of m.lessons || []) {
          for (const s of l.steps || []) {
            steps.push({
              id: s.id,
              title: s.title,
              type: s.type || s.content?.kind || 'step',
              isRequired: Boolean(s.isRequired),
              moduleTitle: m.title || null,
              lessonTitle: l.title || null,
              content: s.content || null,
            });
          }
        }
      }
      return {
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        title: parsed.title || null,
        description: parsed.description || null,
        steps,
      };
    });
    return row;
  }
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
    this.transaction(()=>{ if(usage) this.db.prepare('UPDATE courses SET category_id=?,updated_at=? WHERE category_id=?').run(replacementId ?? null,new Date().toISOString(),id); this.db.prepare('DELETE FROM categories WHERE id=?').run(id); this.audit(adminId,'category:remove','category',id,reason,{usage,replacementId:replacementId||null}); });
    return {success:true,reassigned:usage};
  }

}
