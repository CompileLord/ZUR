import { getPostSignInDestination } from '../../router/routes.ts';
import { renderIcon } from '../../components/common/index.ts';
import { renderSignInPage } from '../../pages/account/SignInPage.ts';
import { renderSignUpPage } from '../../pages/account/SignUpPage.ts';
import { renderVerifyEmailPage } from '../../pages/account/VerifyEmailPage.ts';
import { renderResetPasswordPage, renderForgotPasswordPage } from '../../pages/account/PasswordRecoveryPages.ts';
import { type RouteContext } from '../context.ts';
import { escapeHtml } from '../helpers.ts';
import { confirmUnsyncedSignOut } from '../leave-guards.ts';
import { navigateTo } from '../navigation.ts';
import { loadInvitationPage } from './learner-home-controller.ts';
import { appEl, authClient } from '../state.ts';

export function renderAccountRoute(ctx: RouteContext): void {
  const { route, params, searchParams, currentUser, path } = ctx;
  if (route.pageId === 'P08') { void loadInvitationPage(params.token, path); return; }
  // Account Pages (P04, P05, P06, P07)
  if (route.pageId === 'P04') {
    const returnTo = searchParams.get('returnTo') || '';
    appEl.innerHTML = renderSignInPage({ returnTo, notice: searchParams.get('notice') === 'session-expired' ? 'Your session expired. Sign in again to continue.' : undefined });
    attachSignInListeners();
  } else if (route.pageId === 'P05') {
    const returnTo = searchParams.get('returnTo') || '';
    appEl.innerHTML = renderSignUpPage({ returnTo });
    attachSignUpListeners();
  } else if (route.pageId === 'P06') {
    const token = searchParams.get('token');
    const email = currentUser?.email || searchParams.get('email') || '';
    appEl.innerHTML = renderVerifyEmailPage({ email });
    attachVerifyEmailListeners(token);
  } else if (route.pageId === 'P07') {
    const isReset = path.split('?')[0] === '/reset-password';
    if (isReset) {
      const token = searchParams.get('token') || '';
      appEl.innerHTML = renderResetPasswordPage({ token });
      attachResetPasswordListeners();
    } else {
      appEl.innerHTML = renderForgotPasswordPage();
      attachForgotPasswordListeners();
    }
  }
  return;
}

function attachSignInListeners(): void {
  const form = document.getElementById('sign-in-form') as HTMLFormElement | null;
  const togglePass = document.getElementById('toggle-password');
  const passInput = document.getElementById('password') as HTMLInputElement | null;
  const errorEl = document.getElementById('sign-in-error');

  if (togglePass && passInput) {
    togglePass.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      const label = isPass ? 'Hide password' : 'Show password';
      togglePass.setAttribute('aria-label', label);
      togglePass.setAttribute('title', label);
      togglePass.innerHTML = renderIcon(isPass ? 'eye-off' : 'eye', { size: 16 });
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const returnTo = (form.elements.namedItem('returnTo') as HTMLInputElement).value;
      const submitBtn = document.getElementById('submit-sign-in') as HTMLButtonElement | null;

      if (!email || !password) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>Email and password are required.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';
      }

      try {
        await authClient.signIn(email, password);
        const destination = getPostSignInDestination(returnTo, authClient.getUser());
        navigateTo(destination);
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Invalid email or password.')}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
        }
      }
    });
  }
}

function attachSignUpListeners(): void {
  const form = document.getElementById('sign-up-form') as HTMLFormElement | null;
  const togglePass = document.getElementById('toggle-password');
  const passInput = document.getElementById('password') as HTMLInputElement | null;
  const errorEl = document.getElementById('sign-up-error');

  if (togglePass && passInput) {
    togglePass.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      const label = isPass ? 'Hide password' : 'Show password';
      togglePass.setAttribute('aria-label', label);
      togglePass.setAttribute('title', label);
      togglePass.innerHTML = renderIcon(isPass ? 'eye-off' : 'eye', { size: 16 });
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const adultConfirmed = (form.elements.namedItem('adultConfirmed') as HTMLInputElement).checked;
      const submitBtn = document.getElementById('submit-sign-up') as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
      }

      try {
        await authClient.signUp(displayName, email, password, adultConfirmed);
        navigateTo(`/verify-email?email=${encodeURIComponent(email)}`);
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Could not create account.')}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create account';
        }
      }
    });
  }
}

function attachVerifyEmailListeners(token?: string | null): void {
  if (token) {
    authClient.verifyEmail(token)
      .then(() => {
        appEl.innerHTML = renderVerifyEmailPage({ isVerified: true });
      })
      .catch((err) => {
        appEl.innerHTML = renderVerifyEmailPage({ error: err.message || 'Verification link expired or invalid.' });
      });
    return;
  }

  const resendForm = document.getElementById('resend-verification-form');
  if (resendForm) {
    resendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (resendForm.querySelector('input[name="email"]') as HTMLInputElement)?.value;
      const resendBtn = document.getElementById('btn-resend-verification') as HTMLButtonElement | null;

      if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending…';
      }

      try {
        await authClient.resendVerification(email);
        appEl.innerHTML = renderVerifyEmailPage({
          email,
          infoMessage: 'A new verification link has been sent to your email.',
          cooldownRemaining: 60,
        });
        startCooldownTimer(60, email);
      } catch (err: any) {
        appEl.innerHTML = renderVerifyEmailPage({
          email,
          error: err.message || 'Failed to resend verification email.',
        });
      }
    });
  }

  const diffAccountLink = document.getElementById('use-different-account');
  if (diffAccountLink) {
    diffAccountLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const user = authClient.getUser();
      if (user && !await confirmUnsyncedSignOut(user.id)) return;
      await authClient.signOut();
      navigateTo('/sign-in');
    });
  }
}

function startCooldownTimer(seconds: number, email: string): void {
  let remaining = seconds;
  const timer = setInterval(() => {
    remaining -= 1;
    const btn = document.getElementById('btn-resend-verification') as HTMLButtonElement | null;
    if (btn) {
      if (remaining > 0) {
        btn.textContent = `Resend email (${remaining}s)`;
        btn.disabled = true;
      } else {
        btn.textContent = 'Resend email';
        btn.disabled = false;
        clearInterval(timer);
      }
    } else {
      clearInterval(timer);
    }
  }, 1000);
}

function attachForgotPasswordListeners(): void {
  const form = document.getElementById('forgot-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('forgot-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const submitBtn = document.getElementById('submit-forgot-password') as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending reset link…';
      }

      try {
        await authClient.forgotPassword(email);
        appEl.innerHTML = renderForgotPasswordPage({ isSubmitted: true });
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Unable to process request.')}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send reset link';
        }
      }
    });
  }
}

function attachResetPasswordListeners(): void {
  const form = document.getElementById('reset-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('reset-error');
  const toggleBtn = document.getElementById('toggle-reset-passwords');
  const pass1 = document.getElementById('password') as HTMLInputElement | null;
  const pass2 = document.getElementById('confirmPassword') as HTMLInputElement | null;

  if (toggleBtn && pass1 && pass2) {
    toggleBtn.addEventListener('click', () => {
      const isPass = pass1.type === 'password';
      pass1.type = isPass ? 'text' : 'password';
      pass2.type = isPass ? 'text' : 'password';
      toggleBtn.textContent = isPass ? 'Hide passwords' : 'Show passwords';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = (form.elements.namedItem('token') as HTMLInputElement).value;
      const password = (form.elements.namedItem('newPassword') as HTMLInputElement)?.value || (form.elements.namedItem('password') as HTMLInputElement)?.value;
      const confirmPassword = (form.elements.namedItem('confirmNewPassword') as HTMLInputElement)?.value || (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value;
      const submitBtn = document.getElementById('submit-reset-password') as HTMLButtonElement | null;

      if (password !== confirmPassword) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>Passwords do not match.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating password…';
      }

      try {
        await authClient.resetPassword(token, password);
        appEl.innerHTML = renderResetPasswordPage({ isSuccess: true });
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Reset link expired or invalid.')}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update password';
        }
      }
    });
  }
}
