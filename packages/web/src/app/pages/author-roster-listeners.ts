import { navigateTo, renderApp } from '../navigation.ts';
import { courseClient } from '../state.ts';

export function attachRosterListeners(courseId: string, currentFilters: { search?: string; status?: string; version?: string }): void {
  // Tab switching
  const tabBtnEnrolled = document.getElementById('tab-btn-enrolled');
  const tabBtnInvitations = document.getElementById('tab-btn-invitations');
  const panelEnrolled = document.getElementById('panel-enrolled');
  const panelInvitations = document.getElementById('panel-invitations');

  tabBtnEnrolled?.addEventListener('click', () => {
    panelEnrolled?.classList.remove('hidden');
    panelInvitations?.classList.add('hidden');
    tabBtnEnrolled.classList.add('active', 'border-primary', 'text-primary');
    tabBtnEnrolled.classList.remove('border-transparent', 'text-secondary');
    tabBtnEnrolled.setAttribute('aria-selected', 'true');
    tabBtnInvitations?.classList.remove('active', 'border-primary', 'text-primary');
    tabBtnInvitations?.classList.add('border-transparent', 'text-secondary');
    tabBtnInvitations?.setAttribute('aria-selected', 'false');
  });

  tabBtnInvitations?.addEventListener('click', () => {
    panelInvitations?.classList.remove('hidden');
    panelEnrolled?.classList.add('hidden');
    tabBtnInvitations.classList.add('active', 'border-primary', 'text-primary');
    tabBtnInvitations.classList.remove('border-transparent', 'text-secondary');
    tabBtnInvitations.setAttribute('aria-selected', 'true');
    tabBtnEnrolled?.classList.remove('active', 'border-primary', 'text-primary');
    tabBtnEnrolled?.classList.add('border-transparent', 'text-secondary');
    tabBtnEnrolled?.setAttribute('aria-selected', 'false');
  });

  // Filters
  const searchInput = document.getElementById('roster-search') as HTMLInputElement | null;
  const statusSelect = document.getElementById('roster-status-filter') as HTMLSelectElement | null;
  const versionSelect = document.getElementById('roster-version-filter') as HTMLSelectElement | null;
  const applyBtn = document.getElementById('btn-apply-filters');
  const resetBtn = document.getElementById('btn-clear-roster-filters');

  const executeFilter = () => {
    const url = new URL(window.location.href);
    if (searchInput?.value?.trim()) {
      url.searchParams.set('search', searchInput.value.trim());
    } else {
      url.searchParams.delete('search');
    }
    if (statusSelect?.value && statusSelect.value !== 'all') {
      url.searchParams.set('status', statusSelect.value);
    } else {
      url.searchParams.delete('status');
    }
    if (versionSelect?.value) {
      url.searchParams.set('version', versionSelect.value);
    } else {
      url.searchParams.delete('version');
    }
    navigateTo(url.pathname + url.search);
  };

  applyBtn?.addEventListener('click', executeFilter);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeFilter();
    }
  });
  statusSelect?.addEventListener('change', executeFilter);
  versionSelect?.addEventListener('change', executeFilter);

  resetBtn?.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('search');
    url.searchParams.delete('status');
    url.searchParams.delete('version');
    navigateTo(url.pathname + url.search);
  });

  document.querySelectorAll<HTMLElement>('.roster-row[data-enrollment-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if ((event.target as Element).closest('a, button, details, summary, input, select')) return;
      navigateTo(`/teach/${encodeURIComponent(courseId)}/students/${encodeURIComponent(row.dataset.enrollmentId || '')}`);
    });
  });

  // Modal dialog close
  const closeAllModals = () => {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
  };

  document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', closeAllModals);
  });

  // Open invite modal
  const btnOpenInvite = document.getElementById('btn-open-invite-modal');
  const inviteModal = document.getElementById('invite-students-modal');
  btnOpenInvite?.addEventListener('click', () => {
    inviteModal?.classList.remove('hidden');
    (document.getElementById('invite-recipient-email') as HTMLElement | null)?.focus();
  });

  // Invite modal tab toggling
  const inviteTabEmail = document.getElementById('invite-tab-email');
  const inviteTabLink = document.getElementById('invite-tab-link');
  const invitePanelEmail = document.getElementById('invite-panel-email');
  const invitePanelLink = document.getElementById('invite-panel-link');

  inviteTabEmail?.addEventListener('click', () => {
    invitePanelEmail?.classList.remove('hidden');
    invitePanelLink?.classList.add('hidden');
    inviteTabEmail.classList.add('active', 'border-primary', 'text-primary');
    inviteTabEmail.classList.remove('border-transparent', 'text-secondary');
    inviteTabLink?.classList.remove('active', 'border-primary', 'text-primary');
    inviteTabLink?.classList.add('border-transparent', 'text-secondary');
  });

  inviteTabLink?.addEventListener('click', () => {
    invitePanelLink?.classList.remove('hidden');
    invitePanelEmail?.classList.add('hidden');
    inviteTabLink.classList.add('active', 'border-primary', 'text-primary');
    inviteTabLink.classList.remove('border-transparent', 'text-secondary');
    inviteTabEmail?.classList.remove('active', 'border-primary', 'text-primary');
    inviteTabEmail?.classList.add('border-transparent', 'text-secondary');
  });

  // Send email invitation
  const formEmailInvite = document.getElementById('form-invite-email') as HTMLFormElement | null;
  const emailError = document.getElementById('email-invite-error');
  const emailSuccess = document.getElementById('email-invite-success');
  const btnSubmitEmail = document.getElementById('btn-submit-email-invite') as HTMLButtonElement | null;

  formEmailInvite?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('invite-recipient-email') as HTMLInputElement)?.value?.trim();
    if (!email) return;

    if (btnSubmitEmail) {
      btnSubmitEmail.disabled = true;
        btnSubmitEmail.textContent = 'Sending invitation…';
    }
    if (emailError) emailError.classList.add('hidden');
    if (emailSuccess) emailSuccess.classList.add('hidden');

    try {
      const created = await courseClient.createInvitation(courseId, { type: 'email', recipientEmail: email });
      const emailLink = document.getElementById('email-created-link') as HTMLInputElement;
      emailLink.value = `${window.location.origin}/join/${created.token}`;
      document.getElementById('email-created-link-container')?.classList.remove('hidden');
      if (emailSuccess) {
        emailSuccess.textContent = created.delivery?.message || 'Invitation is valid. Email delivery status is unavailable; copy its link to send it manually.';
        emailSuccess.classList.toggle('alert-success', created.delivery?.status === 'sent');
        emailSuccess.classList.toggle('alert-info', created.delivery?.status !== 'sent');
        emailSuccess.classList.remove('hidden');
      }
      btnSubmitEmail?.classList.add('hidden');
    } catch (err: any) {
      if (emailError) {
        emailError.textContent = err.message || 'Failed to create invitation.';
        emailError.classList.remove('hidden');
      }
    } finally {
      if (btnSubmitEmail) {
        btnSubmitEmail.disabled = false;
        btnSubmitEmail.textContent = 'Send invitation';
      }
    }
  });


  document.getElementById('btn-copy-email-link')?.addEventListener('click', async () => {
    const link = (document.getElementById('email-created-link') as HTMLInputElement)?.value;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      const status = document.getElementById('email-invite-success');
      if (status) status.textContent = 'Link copied. Send it privately to the recipient.';
    } catch {
      const status = document.getElementById('email-invite-error');
      if (status) { status.textContent = 'Copy failed. Select the link and copy it manually.'; status.classList.remove('hidden'); }
    }
  });

  // Generate shareable link
  const formLinkInvite = document.getElementById('form-invite-link') as HTMLFormElement | null;
  const linkError = document.getElementById('link-invite-error');
  const btnCreateLink = document.getElementById('btn-create-shareable-link') as HTMLButtonElement | null;
  const genContainer = document.getElementById('generated-link-container');
  const genInput = document.getElementById('generated-invite-input') as HTMLInputElement | null;
  const btnCopyGenLink = document.getElementById('btn-copy-generated-link') as HTMLButtonElement | null;

  formLinkInvite?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = Number((document.getElementById('invite-link-days') as HTMLSelectElement)?.value || 14);
    const maxUsesVal = (document.getElementById('invite-link-max-uses') as HTMLInputElement)?.value?.trim();
    const maxUses = maxUsesVal ? Number(maxUsesVal) : undefined;

    if (btnCreateLink) {
      btnCreateLink.disabled = true;
      btnCreateLink.textContent = 'Generating…';
    }
    if (linkError) linkError.classList.add('hidden');

    try {
      const res = await courseClient.createInvitation(courseId, { type: 'shareable_link', expiresInDays: days, maxUses });
      const fullUrl = `${window.location.origin}/join/${res.token}`;
      if (genInput) genInput.value = fullUrl;
      genContainer?.classList.remove('hidden');
    } catch (err: any) {
      if (linkError) {
        linkError.textContent = err.message || 'Failed to generate link.';
        linkError.classList.remove('hidden');
      }
    } finally {
      if (btnCreateLink) {
        btnCreateLink.disabled = false;
        btnCreateLink.textContent = 'Generate shareable link';
      }
    }
  });

  btnCopyGenLink?.addEventListener('click', () => {
    if (genInput?.value) {
      navigator.clipboard.writeText(genInput.value);
      btnCopyGenLink.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyGenLink.textContent = 'Copy link';
      }, 2000);
    }
  });

  // Copy link in table
  document.querySelectorAll<HTMLButtonElement>('[data-action="copy-invite-url"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.copyUrl;
      if (url) {
        navigator.clipboard.writeText(url);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="roster-page"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      const next = Number(btn.dataset.offset);
      if (next > 0) url.searchParams.set('offset', String(next));
      else url.searchParams.delete('offset');
      navigateTo(url.pathname + url.search);
    });
  });

  // Revoke invitation button
  document.querySelectorAll<HTMLButtonElement>('[data-action="revoke-invitation"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invitationId;
      if (!invId) return;
      if (!confirm('Revoke this invitation? Anyone holding this link will no longer be able to enroll.')) return;
      try {
        await courseClient.revokeInvitation(invId);
        renderApp();
      } catch (err: any) {
        alert(err.message || 'Failed to revoke invitation.');
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="resend-invitation"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invitationId;
      if (!invId || !confirm('Regenerate this invitation link? The old link will stop working. Existing enrollments remain.')) return;
      btn.disabled = true;
      try {
        const result = await courseClient.resendInvitation(invId);
        inviteModal?.classList.remove('hidden');
        inviteTabEmail?.click();
        const emailLink = document.getElementById('email-created-link') as HTMLInputElement;
        emailLink.value = `${window.location.origin}/join/${result.token}`;
        document.getElementById('email-created-link-container')?.classList.remove('hidden');
        if (emailSuccess) {
          emailSuccess.textContent = result.delivery?.message || 'Invitation is valid. Email delivery status is unavailable; copy its link to send it manually.';
          emailSuccess.classList.toggle('alert-success', result.delivery?.status === 'sent');
          emailSuccess.classList.toggle('alert-info', result.delivery?.status !== 'sent');
          emailSuccess.classList.remove('hidden');
        }
        btnSubmitEmail?.classList.add('hidden');
      } catch (err: any) {
        alert(err.message || 'Failed to regenerate invitation.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Open revoke student modal
  const revokeModal = document.getElementById('revoke-student-modal');
  const revokeNameEl = document.getElementById('revoke-student-display-name');
  const revokeIdInput = document.getElementById('revoke-enrollment-id-input') as HTMLInputElement | null;
  const revokeReasonInput = document.getElementById('revoke-reason-input') as HTMLInputElement | null;
  const btnConfirmRevoke = document.getElementById('btn-confirm-revoke') as HTMLButtonElement | null;

  document.querySelectorAll<HTMLButtonElement>('[data-action="open-revoke"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (revokeNameEl) revokeNameEl.textContent = btn.dataset.studentName || '';
      if (revokeIdInput) revokeIdInput.value = btn.dataset.enrollmentId || '';
      if (revokeReasonInput) revokeReasonInput.value = '';
      revokeModal?.classList.remove('hidden');
    });
  });

  btnConfirmRevoke?.addEventListener('click', async () => {
    const enrId = revokeIdInput?.value;
    if (!enrId) return;
    btnConfirmRevoke.disabled = true;
    btnConfirmRevoke.textContent = 'Revoking…';
    try {
      await courseClient.revokeStudent(courseId, enrId, revokeReasonInput?.value?.trim() || undefined);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke access.');
      btnConfirmRevoke.disabled = false;
      btnConfirmRevoke.textContent = 'Revoke access';
    }
  });

  // Open reinstate student modal
  const reinstateModal = document.getElementById('reinstate-student-modal');
  const reinstateNameEl = document.getElementById('reinstate-student-display-name');
  const reinstateIdInput = document.getElementById('reinstate-enrollment-id-input') as HTMLInputElement | null;
  const btnConfirmReinstate = document.getElementById('btn-confirm-reinstate') as HTMLButtonElement | null;

  document.querySelectorAll<HTMLButtonElement>('[data-action="open-reinstate"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (reinstateNameEl) reinstateNameEl.textContent = btn.dataset.studentName || '';
      if (reinstateIdInput) reinstateIdInput.value = btn.dataset.enrollmentId || '';
      reinstateModal?.classList.remove('hidden');
    });
  });

  btnConfirmReinstate?.addEventListener('click', async () => {
    const enrId = reinstateIdInput?.value;
    if (!enrId) return;
    btnConfirmReinstate.disabled = true;
    btnConfirmReinstate.textContent = 'Reinstating…';
    try {
      await courseClient.reinstateStudent(courseId, enrId);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to reinstate access.');
      btnConfirmReinstate.disabled = false;
      btnConfirmReinstate.textContent = 'Reinstate access';
    }
  });
}
