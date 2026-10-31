import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Admin: execution kill switch, operations overview, users, support access.
export async function handleAdminOperationsRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, db, identityService, operationalMetrics, adminService, parseJsonBody, sendJson, adminPage } = rc;

  // 23. Operator Kill Switch: Status, Pause, Resume (T024)
  if (method === 'GET' && pathname === '/api/admin/execution/status') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    adminService.requireAdmin(user.id);
    const overview = adminService.getOperationsOverview(user.id);
    sendJson(res, 200, { executionPaused: overview.execution.paused, updatedAt: overview.execution.updatedAt });
    return true;
  }

  if (method === 'POST' && pathname === '/api/admin/execution/pause') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    adminService.requireAdmin(user.id);
    const body = await parseJsonBody(req);
    identityService.verifyCurrentPassword(user.id, body.currentPassword);
    sendJson(res, 200, adminService.setExecutionPaused(user.id, true, body.reason));
    return true;
  }

  if (method === 'POST' && pathname === '/api/admin/execution/resume') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    adminService.requireAdmin(user.id);
    const body = await parseJsonBody(req);
    identityService.verifyCurrentPassword(user.id, body.currentPassword);
    sendJson(res, 200, adminService.setExecutionPaused(user.id, false, body.reason));
    return true;
  }

  if (method === 'GET' && pathname === '/api/admin/operations') {
    if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token);
    const overview = adminService.getOperationsOverview(user.id, operationalMetrics);
    sendJson(res,200,{...overview,operational:operationalMetrics.snapshot(db)}); return true;
  }
  if (method === 'GET' && pathname === '/api/admin/operations/metrics') {
    if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token);
    adminService.getOperationsOverview(user.id, operationalMetrics);
    sendJson(res,200,operationalMetrics.snapshot(db)); return true;
  }
  if (method === 'GET' && pathname === '/api/admin/execution/jobs') {
    if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token); const page=adminPage();
    sendJson(res,200,adminService.listExecutionJobs(user.id,url.searchParams.get('from')||undefined,url.searchParams.get('to')||undefined,page.limit,page.offset)); return true;
  }
  if (method === 'GET' && pathname === '/api/admin/users') {
    if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token); const page=adminPage();
    sendJson(res,200,adminService.listUsers(user.id,{search:url.searchParams.get('search')||undefined,status:url.searchParams.get('status')||undefined,capability:url.searchParams.get('capability')||undefined,...page})); return true;
  }
  const adminUserMatch=pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)$/);
  if(method==='GET'&&adminUserMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getUserDetail(user.id,adminUserMatch[1]));return true;}
  const adminUserActionMatch=pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)\/(grant-author|revoke-author|suspend|restore)$/);
  if(method==='POST'&&adminUserActionMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const action=adminUserActionMatch[2].replace('-','_') as any;sendJson(res,200,adminService.changeUserState(user.id,adminUserActionMatch[1],action,body.reason));return true;}
  if(method==='POST'&&pathname==='/api/admin/support-access'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const grant=adminService.beginSupportAccess(user.id,body.userId,body.courseId,body.reason);sendJson(res,201,grant);return true;}
  const supportRecords=pathname.match(/^\/api\/admin\/support-access\/([a-zA-Z0-9_-]+)\/records$/);
  if(method==='GET'&&supportRecords){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getSupportedStudentRecords(user.id,supportRecords[1]));return true;}
  const supportRevoke=pathname.match(/^\/api\/admin\/support-access\/([a-zA-Z0-9_-]+)\/revoke$/);
  if(method==='POST'&&supportRevoke){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.revokeSupportAccess(user.id,supportRevoke[1],body.reason));return true;}

  return false;
}
