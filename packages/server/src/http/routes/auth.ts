import { AuthenticationError, ValidationError } from 'zur-shared';
import { IdentityService } from '../../services/identity-service.ts';
import { requireStrings } from '../body.ts';
import { getClientIp } from '../client-ip.ts';
import { sessionCookie, clearSessionCookie } from '../security.ts';
import type { RouteContext } from './context.ts';

// Sign-up, verification, sign-in/out and password recovery (no session required).
export async function handleAuthRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, identityService, emailDeliveryService, parseJsonBody, sendJson, getSessionToken } = rc;

  // 1. Sign Up (T013)
  if (method === 'POST' && pathname === '/api/auth/sign-up') {
    const body = await parseJsonBody(req);
    requireStrings(body, { displayName: { max: 200 }, email: { max: 320 }, password: { max: 1024 } });
    IdentityService.validateSignUpInput(body);
    if (body.adultConfirmed !== true) throw new ValidationError('Adult eligibility confirmation is required.');
    // Sized for a classroom registering together behind one NAT address.
    identityService.consumeRequestRateLimit('sign-up-ip', getClientIp(req), 50, 60 * 60 * 1000);
    const result = identityService.signUp(body);
    const delivery = await emailDeliveryService.sendAccountLink({ recipientEmail: result.user.email,
      kind: 'verify', path: `/verify-email?token=${encodeURIComponent(result.verificationToken)}` });
    sendJson(res, 201, { user: result.user, deliveryStatus: delivery.status });
    return true;
  }

  // 2. Email Verification (T013)
  if (method === 'POST' && pathname === '/api/auth/verify-email') {
    const body = await parseJsonBody(req);
    requireStrings(body, { token: { max: 512 } });
    const result = identityService.verifyEmail(body.token);
    sendJson(res, 200, result);
    return true;
  }

  // 3. Resend Verification (T013)
  if (method === 'POST' && pathname === '/api/auth/resend-verification') {
    identityService.consumeRequestRateLimit('resend-ip', getClientIp(req), 30, 60 * 60 * 1000);
    const body = await parseJsonBody(req);
    requireStrings(body, { email: { max: 320 } });
    identityService.consumeRequestRateLimit('resend-email', String(body.email || '').trim().toLowerCase(), 5, 60 * 60 * 1000);
    const result = identityService.resendVerificationEmail(body.email);
    if (result.verificationToken) await emailDeliveryService.sendAccountLink({
      recipientEmail: String(body.email).trim().toLowerCase(), kind: 'verify',
      path: `/verify-email?token=${encodeURIComponent(result.verificationToken)}` });
    sendJson(res, 200, { success: true });
    return true;
  }

  // 4. Sign In (T014)
  if (method === 'POST' && pathname === '/api/auth/sign-in') {
    const body = await parseJsonBody(req);
    requireStrings(body, { email: { max: 320 }, password: { max: 1024 } });
    const session = identityService.signIn({
      email: body.email,
      password: body.password,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    // Set HttpOnly session cookie
    const cookieHeader = sessionCookie(req, session.token);
    sendJson(res, 200, session, { 'Set-Cookie': cookieHeader });
    return true;
  }

  // 5. Sign Out (T014)
  if (method === 'POST' && pathname === '/api/auth/sign-out') {
    const token = getSessionToken(req);
    if (token) {
      identityService.signOut(token);
    }
    const clearCookie = clearSessionCookie(req);
    sendJson(res, 200, { success: true }, { 'Set-Cookie': clearCookie });
    return true;
  }

  // 6. Sign Out All Devices (T014)
  if (method === 'POST' && pathname === '/api/auth/sign-out-all') {
    const token = getSessionToken(req);
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    identityService.signOutAll(user.id);
    const clearCookie = clearSessionCookie(req);
    sendJson(res, 200, { success: true }, { 'Set-Cookie': clearCookie });
    return true;
  }

  // 7. Password Recovery Request (T015)
  if (method === 'POST' && pathname === '/api/auth/forgot-password') {
    identityService.consumeRequestRateLimit('recovery-ip', getClientIp(req), 30, 60 * 60 * 1000);
    const body = await parseJsonBody(req);
    requireStrings(body, { email: { max: 320 } });
    identityService.consumeRequestRateLimit('recovery-email', String(body.email || '').trim().toLowerCase(), 5, 60 * 60 * 1000);
    const result = identityService.requestPasswordReset(body.email);
    if (result.resetToken) await emailDeliveryService.sendAccountLink({
      recipientEmail: String(body.email).trim().toLowerCase(), kind: 'reset',
      path: `/reset-password?token=${encodeURIComponent(result.resetToken)}` });
    sendJson(res, 200, { success: true });
    return true;
  }

  // 8. Password Reset (T015)
  if (method === 'POST' && pathname === '/api/auth/reset-password') {
    identityService.consumeRequestRateLimit('reset-ip', getClientIp(req), 20, 15 * 60 * 1000);
    const body = await parseJsonBody(req);
    requireStrings(body, { token: { max: 512 }, password: { max: 1024 } });
    const success = identityService.resetPassword(body.token, body.password);
    const clearCookie = clearSessionCookie(req);
    sendJson(res, 200, { success }, { 'Set-Cookie': clearCookie });
    return true;
  }

  return false;
}
