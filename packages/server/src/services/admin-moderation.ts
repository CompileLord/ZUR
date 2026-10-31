import fs from 'node:fs';
import { ConflictError, NotFoundError, ValidationError } from 'zur-shared';
import { AdminCourses } from './admin-courses.ts';

export class AdminModeration extends AdminCourses {
  listReports(adminId: string,status?:string,limit=20,offset=0){
    this.requireAdmin(adminId); this.page(limit,offset); if(status&&!['open','investigating','resolved'].includes(status))throw new ValidationError('Invalid report status.');
    const where=status?'WHERE r.status=?':'';const args=status?[status]:[];
    const total=(this.db.prepare(`SELECT COUNT(*) count FROM reports r ${where}`).get(...args) as any).count;
    const items=this.db.prepare(`SELECT r.id,r.type,r.status,r.description,r.course_id courseId,r.course_version_id courseVersionId,r.step_id stepId,r.created_at createdAt,u.display_name reporterName,c.title courseTitle
      FROM reports r JOIN users u ON u.id=r.reporter_id JOIN courses c ON c.id=r.course_id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).all(...args,limit,offset);
    return {items,total,limit,offset};
  }
  getReport(adminId:string,id:string){
    this.requireAdmin(adminId);
    const report=this.db.prepare(`SELECT r.id,r.type,r.status,r.description,r.submitted_code submittedCode,r.course_id courseId,r.course_version_id courseVersionId,r.step_id stepId,r.resolution_notes resolutionNotes,r.resolution_outcome resolutionOutcome,r.internal_notes internalNotes,r.created_at createdAt,u.display_name reporterName,c.title courseTitle FROM reports r JOIN users u ON u.id=r.reporter_id JOIN courses c ON c.id=r.course_id WHERE r.id=?`).get(id) as any;
    if(!report)throw new NotFoundError("This page isn't available.");
    let versionNumber: number | null = null;
    let isLatestVersion: boolean | null = null;
    let stepTitle: string | null = null;
    let versionDetails: { id: string; versionNumber: number; createdAt: string; isLatest: boolean } | null = null;

    if (report.courseVersionId) {
      const v = this.db.prepare('SELECT id, version_number, created_at, snapshot_data FROM course_versions WHERE id=? AND course_id=?').get(report.courseVersionId, report.courseId) as any;
      if (v) {
        versionNumber = v.version_number;
        const latest = this.db.prepare('SELECT id FROM course_versions WHERE course_id=? ORDER BY version_number DESC LIMIT 1').get(report.courseId) as any;
        isLatestVersion = latest ? latest.id === v.id : false;
        versionDetails = {
          id: v.id,
          versionNumber: v.version_number,
          createdAt: v.created_at,
          isLatest: isLatestVersion,
        };
        if (report.stepId) {
          try {
            const snapshot = JSON.parse(v.snapshot_data);
            const step = (snapshot.modules || []).flatMap((m: any) => m.lessons || []).flatMap((l: any) => l.steps || []).find((s: any) => s.id === report.stepId);
            if (step) {
              stepTitle = step.title;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return {
      ...report,
      versionNumber,
      isLatestVersion,
      stepTitle,
      versionDetails,
    };
  }
  updateReport(adminId:string,id:string,status:string,outcome:string,internalNotes:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);if(!['open','investigating','resolved'].includes(status))throw new ValidationError('Invalid report status.');if(status==='resolved'&&(!outcome.trim()||outcome.trim().length>2000))throw new ValidationError('A resolution outcome is required.');if(internalNotes.length>4000)throw new ValidationError('Internal notes are too long.');const now=new Date().toISOString();const res=this.db.prepare('UPDATE reports SET status=?,resolution_outcome=?,internal_notes=?,resolution_notes=?,resolved_by=?,updated_at=? WHERE id=?').run(status,status==='resolved'?outcome.trim():null,internalNotes.trim()||null,status==='resolved'?outcome.trim():null,status==='resolved'?adminId:null,now,id);if(!res.changes)throw new NotFoundError("This page isn't available.");this.audit(adminId,'report:status','report',id,why,{status});return this.getReport(adminId,id);}

  listMedia(adminId:string,limit=20,offset=0){this.requireAdmin(adminId);this.page(limit,offset);const total=(this.db.prepare('SELECT COUNT(*) count FROM media_assets').get() as any).count;const items=this.db.prepare(`SELECT a.id,a.course_id courseId,c.title courseTitle,a.uploader_id uploaderId,a.file_size fileSize,a.mime_type mimeType,a.dimensions,a.alt_text altText,a.is_decorative isDecorative,a.caption,a.processing_status processingStatus,a.created_at createdAt,a.updated_at updatedAt FROM media_assets a JOIN courses c ON c.id=a.course_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(limit,offset) as any[];return {items:items.map(a=>{const versions=(this.db.prepare('SELECT COUNT(*) count FROM course_versions WHERE course_id=? AND instr(CAST(snapshot_data AS TEXT),?)>0').get(a.courseId,a.id) as any).count;const drafts=(this.db.prepare(`SELECT COUNT(*) count FROM step_contents sc JOIN steps s ON s.id=sc.step_id JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND sc.content_payload LIKE ?`).get(a.courseId,`%${a.id}%`) as any).count;return {...a,dimensions:a.dimensions?JSON.parse(a.dimensions):null,isDecorative:Boolean(a.isDecorative),referenceCount:versions+drafts};}),total,limit,offset};}
  reviewMedia(adminId:string,id:string,action:'quarantine'|'restore',reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const row=this.db.prepare('SELECT id,processing_status FROM media_assets WHERE id=?').get(id) as any;if(!row)throw new NotFoundError("This page isn't available.");const status=action==='quarantine'?'quarantined':'ready';this.db.prepare('UPDATE media_assets SET processing_status=?,updated_at=? WHERE id=?').run(status,new Date().toISOString(),id);this.audit(adminId,`media:${action}`,'media',id,why,{previousStatus:row.processing_status,status});return {id,processingStatus:status};}
  deleteMedia(adminId:string,id:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const asset=this.db.prepare('SELECT id,course_id,processing_status,file_path FROM media_assets WHERE id=?').get(id) as any;if(!asset)throw new NotFoundError("This page isn't available.");if(asset.processing_status!=='quarantined')throw new ConflictError('Quarantine the asset before deletion.');const needle=`%${id}%`;const published=(this.db.prepare('SELECT COUNT(*) count FROM course_versions WHERE course_id=? AND snapshot_data LIKE ?').get(asset.course_id,needle) as any).count;const draft=(this.db.prepare(`SELECT COUNT(*) count FROM step_contents sc JOIN steps s ON s.id=sc.step_id JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND sc.content_payload LIKE ?`).get(asset.course_id,needle) as any).count;const references=published+draft;if(references)throw new ConflictError(`This asset is referenced by ${references} retained course record(s) and cannot be deleted.`);this.transaction(()=>{this.db.prepare('DELETE FROM media_assets WHERE id=?').run(id);this.audit(adminId,'media:delete','media',id,why,{courseId:asset.course_id,referenceCount:references});});if(fs.existsSync(asset.file_path))fs.unlinkSync(asset.file_path);return {deleted:true,id,referenceCount:references};}
  authorizeMediaPreview(adminId:string,id:string,reason:string){this.requireAdmin(adminId);const why=this.reason(reason);const asset=this.db.prepare('SELECT id,processing_status FROM media_assets WHERE id=?').get(id) as any;if(!asset||asset.processing_status!=='ready')throw new NotFoundError("This page isn't available.");this.audit(adminId,'media:preview','media',id,why,{processingStatus:asset.processing_status});return {authorized:true};}

  listAudit(adminId:string,options:{actorId?:string;action?:string;targetType?:string;targetId?:string;reason?:string;correlationId?:string;from?:string;to?:string;limit?:number;offset?:number}={}){this.requireAdmin(adminId);const limit=options.limit??50,offset=options.offset??0;this.page(limit,offset);const makeWhere=(alias:string,agent=false)=>{const where:string[]=['1=1'],args:any[]=[];const col=(name:string)=>`${alias}.${name}`;if(options.actorId){where.push(`${col(agent?'author_id':'actor_id')}=?`);args.push(options.actorId);}if(options.action){if(agent){where.push(`${col('tool_name')}=?`);args.push(options.action.replace(/^agent:/,''));}else{where.push(`${col('action')}=?`);args.push(options.action);}}if(options.targetType&&(!agent||options.targetType!=='course')){where.push(agent?'1=0':`${col('target_type')}=?`);if(!agent)args.push(options.targetType);}if(options.targetId){where.push(`${col(agent?'course_id':'target_id')}=?`);args.push(options.targetId);}if(options.reason){if(agent)where.push('1=0');else{where.push(`${col('reason')} LIKE ?`);args.push(`%${options.reason.slice(0,100)}%`);}}if(options.correlationId){where.push(`${col('correlation_id')}=?`);args.push(options.correlationId);}if(options.from){where.push(`${col('created_at')}>=?`);args.push(options.from);}if(options.to){where.push(`${col('created_at')}<=?`);args.push(/^\d{4}-\d{2}-\d{2}$/.test(options.to)?`${options.to}T23:59:59.999Z`:options.to);}return {where:where.join(' AND '),args};};const aw=makeWhere('a'),mw=makeWhere('m',true);const totalAudit=(this.db.prepare(`SELECT COUNT(*) count FROM audit_events a WHERE ${aw.where}`).get(...aw.args) as any).count;const totalAgents=(this.db.prepare(`SELECT COUNT(*) count FROM agent_mutations m WHERE ${mw.where}`).get(...mw.args) as any).count;const take=offset+limit;const auditRows=this.db.prepare(`SELECT a.id,a.actor_id actorId,u.display_name actorName,a.action,a.target_type targetType,a.target_id targetId,a.reason,a.correlation_id correlationId,a.created_at createdAt,'audit' source FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE ${aw.where} ORDER BY a.created_at DESC LIMIT ?`).all(...aw.args,take) as any[];const agentRows=this.db.prepare(`SELECT m.id,m.author_id actorId,u.display_name actorName,('agent:'||m.tool_name) action,'course' targetType,m.course_id targetId,c.title targetTitle,'Agent mutation' reason,m.correlation_id correlationId,m.created_at createdAt,'agent' source FROM agent_mutations m JOIN users u ON u.id=m.author_id JOIN courses c ON c.id=m.course_id WHERE ${mw.where} ORDER BY m.created_at DESC LIMIT ?`).all(...mw.args,take) as any[];const merged=[...auditRows,...agentRows].map(row=>({...row,reason:this.sanitizeReason(String(row.reason||''))})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(a.id).localeCompare(String(b.id)));return {items:merged.slice(offset,offset+limit),total:totalAudit+totalAgents,limit,offset};}
  getAuditEvent(adminId:string,id:string){this.requireAdmin(adminId);const row=this.db.prepare(`SELECT a.id,a.actor_id actorId,u.display_name actorName,a.action,a.target_type targetType,a.target_id targetId,a.reason,a.metadata,a.correlation_id correlationId,a.created_at createdAt,'audit' source FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.id=?`).get(id) as any;if(!row){const agent=this.db.prepare(`SELECT m.id,m.author_id actorId,u.display_name actorName,('agent:'||m.tool_name) action,'course' targetType,m.course_id targetId,c.title targetTitle,m.base_revision baseRevision,m.new_revision newRevision,m.affected_entities affectedEntities,m.outcome,m.correlation_id correlationId,m.created_at createdAt,'agent' source FROM agent_mutations m JOIN users u ON u.id=m.author_id JOIN courses c ON c.id=m.course_id WHERE m.id=?`).get(id) as any;if(!agent)throw new NotFoundError("This page isn't available.");try{agent.affectedEntities=JSON.parse(agent.affectedEntities);}catch{agent.affectedEntities=[];}return agent;}const hidden=/password|secret|token|code|stdout|stderr|input|output|test|email|signed.?url|credential/i;const clean=(value:any):any=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!hidden.test(key)).map(([key,v])=>[key,clean(v)]));if(typeof value==='string'&&/https?:\/\/[^\s]*(?:token|signature|x-amz-)/i.test(value))return '[redacted]';return value;};let metadata=null;try{metadata=row.metadata?clean(JSON.parse(row.metadata)):null;}catch{metadata='[unavailable]';}return {...row,reason:this.sanitizeReason(String(row.reason||'')),metadata};}

}
