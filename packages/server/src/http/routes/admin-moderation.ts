import { AuthenticationError, ValidationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Admin: courses, categories, reports, media review, audit log, privacy requests.
export async function handleAdminModerationRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, mediaService, adminService, parseJsonBody, sendJson, adminPage } = rc;

  if(method==='GET'&&pathname==='/api/admin/courses'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listCourses(user.id,url.searchParams.get('search')||'',page.limit,page.offset));return true;}
  const adminCourseMatch=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)$/);
  if(method==='GET'&&adminCourseMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getCourseDetail(user.id,adminCourseMatch[1]));return true;}
  const adminCourseSuspend=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/suspension$/);
  if(method==='POST'&&adminCourseSuspend){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);if(typeof body.suspended!=='boolean'&&body.suspended!=='true'&&body.suspended!=='false')throw new ValidationError('Choose whether to suspend or restore the course.');sendJson(res,200,adminService.setCourseSuspended(user.id,adminCourseSuspend[1],body.suspended===true||body.suspended==='true',body.reason));return true;}
  const adminArchiveCourse=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/archive-for-deletion$/);
  if(method==='POST'&&adminArchiveCourse){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.archiveCourseForDeletion(user.id,adminArchiveCourse[1],body.reason));return true;}
  const adminWaiver=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/waivers$/);
  if(method==='GET'&&adminWaiver){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const query=url.searchParams;sendJson(res,200,adminService.previewWaiver(user.id,adminWaiver[1],query.get('versionId')||'',query.get('stepId')||''));return true;}
  if(method==='POST'&&adminWaiver){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.waiveStep(user.id,adminWaiver[1],body.versionId,body.stepId,body.reason,body.enrollmentIds,Number(body.reviewedAffectedCount)));return true;}
  if(method==='GET'&&pathname==='/api/admin/categories'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,{items:adminService.listCategories(user.id)});return true;}
  if(method==='POST'&&pathname==='/api/admin/categories'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,201,adminService.saveCategory(user.id,body.name,undefined,undefined,body.reason));return true;}
  const adminCategory=pathname.match(/^\/api\/admin\/categories\/([a-zA-Z0-9_-]+)$/);
  if(method==='PUT'&&adminCategory){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.saveCategory(user.id,body.name,adminCategory[1],undefined,body.reason));return true;}
  if(method==='DELETE'&&adminCategory){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.removeCategory(user.id,adminCategory[1],body.replacementId,body.reason));return true;}
  if(method==='GET'&&pathname==='/api/admin/reports'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listReports(user.id,url.searchParams.get('status')||undefined,page.limit,page.offset));return true;}
  const reportDetail=pathname.match(/^\/api\/admin\/reports\/([a-zA-Z0-9_-]+)$/);
  if(method==='GET'&&reportDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getReport(user.id,reportDetail[1]));return true;}
  if(method==='PATCH'&&reportDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.updateReport(user.id,reportDetail[1],body.status,body.outcome||'',body.internalNotes||'',body.reason));return true;}
  if(method==='GET'&&pathname==='/api/admin/media'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listMedia(user.id,page.limit,page.offset));return true;}
  const adminMediaPreview=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)\/preview$/);
  if(method==='POST'&&adminMediaPreview){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);adminService.authorizeMediaPreview(user.id,adminMediaPreview[1],body.reason);const file=mediaService.getAdminPreviewFile(user.id,adminMediaPreview[1]);res.writeHead(200,{'Content-Type':file.mimeType,'Content-Length':file.buffer.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(file.buffer);return true;}
  const adminMediaReview=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)\/(quarantine|restore)$/);
  if(method==='POST'&&adminMediaReview){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const reviewAction=adminMediaReview[2];if(reviewAction!=='restore'&&reviewAction!=='quarantine')throw new ValidationError('Action must be restore or quarantine.');const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.reviewMedia(user.id,adminMediaReview[1],reviewAction,body.reason));return true;}
  const adminMediaDelete=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)$/);
  if(method==='DELETE'&&adminMediaDelete){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.deleteMedia(user.id,adminMediaDelete[1],body.reason));return true;}
  if(method==='GET'&&pathname==='/api/admin/audit'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage('limit','offset');sendJson(res,200,adminService.listAudit(user.id,{actorId:url.searchParams.get('actorId')||undefined,action:url.searchParams.get('action')||undefined,targetType:url.searchParams.get('targetType')||undefined,targetId:url.searchParams.get('targetId')||undefined,reason:url.searchParams.get('reason')||undefined,correlationId:url.searchParams.get('correlationId')||undefined,from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined,...page}));return true;}
  const auditDetail=pathname.match(/^\/api\/admin\/audit\/([a-zA-Z0-9_-]+)$/);
  if(method==='GET'&&auditDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getAuditEvent(user.id,auditDetail[1]));return true;}
  if(method==='GET'&&pathname==='/api/admin/privacy-requests'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listPrivacyRequests(user.id,url.searchParams.get('status')||undefined,page.limit,page.offset));return true;}
  const privacyAction=pathname.match(/^\/api\/admin\/privacy-requests\/([a-zA-Z0-9_-]+)$/);
  if(method==='PATCH'&&privacyAction){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.updatePrivacyRequest(user.id,privacyAction[1],body.status,body.reason));return true;}
  if(method==='POST'&&privacyAction){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.purgeAccount(user.id,privacyAction[1],body.reason));return true;}
  const privacyExport=pathname.match(/^\/api\/admin\/privacy-requests\/([a-zA-Z0-9_-]+)\/export$/);
  if(method==='POST'&&privacyExport){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const bundle=adminService.exportAccount(user.id,privacyExport[1],body.reason);const bytes=Buffer.from(JSON.stringify(bundle,null,2));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="zur-account-export-${privacyExport[1]}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;}

  // 37. Admin: Suspend or Unsuspend Course (T043)
  const adminCourseSuspendMatch = pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/suspend$/);
  if (method === 'POST' && adminCourseSuspendMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = adminCourseSuspendMatch[1];
    const body = await parseJsonBody(req);
    identityService.verifyCurrentPassword(user.id, body.currentPassword);
    if (typeof body.isSuspended !== 'boolean') throw new ValidationError('Choose whether to suspend or restore the course.');
    const updated = adminService.setCourseSuspended(user.id, courseId, body.isSuspended, body.reason);
    sendJson(res, 200, updated);
    return true;
  }

  return false;
}
