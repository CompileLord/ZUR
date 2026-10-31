import type { DatabaseSync } from 'node:sqlite';

/** The one account export package, used by self-service export and the admin privacy queue. */
export function buildAccountExportPackage(db:DatabaseSync,userId:string,privacyRequestId:string){
    const request=db.prepare(`SELECT email,display_name,email_verified,account_status,created_at FROM users WHERE id=?`).get(userId) as any;
    const enrollments=db.prepare(`SELECT e.id,e.course_id,e.pinned_version_id,e.status,e.created_at,c.title course_title FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.created_at`).all(userId) as any[];
    const packageData={
      schemaVersion:1,generatedAt:new Date().toISOString(),privacyRequestId,
      profile:{email:request.email,displayName:request.display_name,emailVerified:Boolean(request.email_verified),accountStatus:request.account_status,createdAt:request.created_at},
      enrollments:enrollments.map(e=>({enrollmentId:e.id,courseId:e.course_id,courseTitle:e.course_title,pinnedVersionId:e.pinned_version_id,status:e.status,createdAt:e.created_at,
        progress:db.prepare(`SELECT step_id stepId,is_completed isCompleted,completed_at completedAt,is_waived isWaived,waiver_reason waiverReason,created_at createdAt,updated_at updatedAt FROM step_progress WHERE enrollment_id=?`).all(e.id),
        attempts:db.prepare(`SELECT id,step_id stepId,course_version_id courseVersionId,attempt_number attemptNumber,type,verdict,code_snapshot codeSnapshot,selected_options selectedOptions,execution_time_ms executionTimeMs,is_infrastructure_failure isInfrastructureFailure,created_at createdAt FROM assessment_attempts WHERE enrollment_id=? ORDER BY created_at`).all(e.id)})),
      codeDrafts:db.prepare(`SELECT d.enrollment_id enrollmentId,d.step_id stepId,d.code,d.revision,d.updated_at updatedAt FROM code_drafts d WHERE d.user_id=? ORDER BY d.updated_at DESC`).all(userId),
      reports:db.prepare(`SELECT r.id,r.course_id courseId,c.title courseTitle,r.course_version_id courseVersionId,r.step_id stepId,r.type,r.description,r.submitted_code submittedCode,r.status,r.resolution_outcome resolutionOutcome,r.created_at createdAt FROM reports r JOIN courses c ON c.id=r.course_id WHERE r.reporter_id=? ORDER BY r.created_at`).all(userId),
      authoredCourses:db.prepare(`SELECT id,title,visibility,publication_status publicationStatus,current_version_id currentVersionId,created_at createdAt,updated_at updatedAt FROM courses WHERE owner_id=? ORDER BY created_at`).all(userId),
      authorAccess:db.prepare(`SELECT id,label,scopes,course_restrictions courseRestrictions,expires_at expiresAt,is_revoked isRevoked,last_used_at lastUsedAt,created_at createdAt FROM author_access_tokens WHERE author_id=? ORDER BY created_at`).all(userId),
      invitationRecords:db.prepare(`SELECT id,course_id courseId,recipient_email recipientEmail,type,max_uses maxUses,uses_count usesCount,expires_at expiresAt,is_revoked isRevoked,email_delivery_status emailDeliveryStatus,email_sent_at emailSentAt,created_at createdAt FROM invitations WHERE inviter_id=? ORDER BY created_at`).all(userId),
      agentActivity:db.prepare(`SELECT id,course_id courseId,tool_name toolName,base_revision baseRevision,new_revision newRevision,affected_entities affectedEntities,outcome,correlation_id correlationId,created_at createdAt FROM agent_mutations WHERE author_id=? ORDER BY created_at`).all(userId),
      privacyRequests:db.prepare(`SELECT id,request_type requestType,status,blocker_reason blockerReason,created_at createdAt,updated_at updatedAt FROM privacy_requests WHERE user_id=? ORDER BY created_at`).all(userId),
    };
    for(const mutation of packageData.agentActivity as any[]){try{mutation.affectedEntities=JSON.parse(mutation.affectedEntities);}catch{mutation.affectedEntities=[];}}
    return packageData;
}
