import { escapeHtml } from '../helpers.ts';
import { appEl, authClient } from '../state.ts';

export function attachTheoryAssetModal(courseId: string): void {
  appEl.querySelector('[data-action="open-asset-modal"]')?.addEventListener('click', () => {
    let assetModal = document.getElementById('theory-asset-modal');
    if (!assetModal) {
      assetModal = document.createElement('div');
      assetModal.id = 'theory-asset-modal';
      assetModal.className = 'modal-backdrop';
      assetModal.setAttribute('role', 'dialog');
      assetModal.setAttribute('aria-modal', 'true');
      assetModal.setAttribute('aria-labelledby', 'asset-modal-title');
      assetModal.innerHTML = `
              <div class="modal-dialog max-w-dialog" tabindex="-1">
                <div class="sheet-header flex justify-between items-center pb-2 border-b border-subtle">
                  <h3 id="asset-modal-title" class="text-base font-semibold">Upload theory image asset</h3>
                  <button type="button" class="btn btn-ghost btn-compact" id="asset-modal-close" aria-label="Close">✕</button>
                </div>
                <div class="modal-body py-3 flex flex-col gap-3">
                  <div class="form-group">
                    <label for="asset-file-picker" class="form-label text-xs font-semibold">Image file (PNG, JPEG, WebP up to 10 MB) *</label>
                    <input type="file" id="asset-file-picker" class="form-input text-sm" accept="image/png,image/jpeg,image/webp" />
                  </div>
                  <div class="form-group">
                    <label for="asset-alt-text" class="form-label text-xs font-semibold">Image description (Alt text) *</label>
                    <input type="text" id="asset-alt-text" class="form-input text-sm" placeholder="Descriptive alt text for learners…" value="Diagram" />
                  </div>
                  <div id="asset-upload-status" class="text-xs text-muted"></div>
                </div>
                <div class="modal-footer flex justify-end gap-2 pt-3 border-t border-subtle">
                  <button type="button" class="btn btn-secondary btn-compact" id="asset-modal-cancel">Cancel</button>
                  <button type="button" class="btn btn-primary btn-compact" id="asset-modal-submit">Upload & Insert</button>
                </div>
              </div>
            `;
      document.body.append(assetModal);
    }
    assetModal.classList.remove('hidden');
    assetModal.style.display = 'flex';
    const fileInput = assetModal.querySelector('#asset-file-picker') as HTMLInputElement | null;
    const altInput = assetModal.querySelector('#asset-alt-text') as HTMLInputElement | null;
    const statusEl = assetModal.querySelector('#asset-upload-status') as HTMLElement | null;
    const submitBtn = assetModal.querySelector('#asset-modal-submit') as HTMLButtonElement | null;
    const closeBtn = assetModal.querySelector('#asset-modal-close');
    const cancelBtn = assetModal.querySelector('#asset-modal-cancel');
    const closeModal = () => {
      assetModal.remove();
    };
    closeBtn?.addEventListener('click', closeModal, { once: true });
    cancelBtn?.addEventListener('click', closeModal, { once: true });

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const file = fileInput?.files?.[0];
        if (!file) {
          if (statusEl) { statusEl.className = 'text-xs text-danger'; statusEl.textContent = 'Please select an image file to upload.'; }
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          if (statusEl) { statusEl.className = 'text-xs text-danger'; statusEl.textContent = 'Image file exceeds 10 MB maximum size limit.'; }
          return;
        }
        const mime = (file.type || 'image/png').toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
          if (statusEl) { statusEl.className = 'text-xs text-danger'; statusEl.textContent = 'Only PNG, JPEG, and WebP images are supported.'; }
          return;
        }
        const rawAlt = altInput?.value?.trim() || file.name;
        const sanitizedAlt = rawAlt.replace(/[\[\]]/g, '').trim() || 'image';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading…';
        if (statusEl) { statusEl.className = 'text-xs text-secondary'; statusEl.textContent = 'Reading file and uploading…'; }
        try {
          const arrayBuffer = await file.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(arrayBuffer);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const asset = await authClient.fetchApi(`/api/author/courses/${encodeURIComponent(courseId)}/assets`, {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name,
              mimeType: mime,
              base64,
              altText: sanitizedAlt,
            }),
          });
          const markdownArea = appEl.querySelector('#theory-markdown-input') as HTMLTextAreaElement | null;
          if (markdownArea) {
            const markdownTag = `\n\n![${sanitizedAlt}](/api/assets/${asset.id})\n\n`;
            const pos = markdownArea.selectionStart ?? markdownArea.value.length;
            markdownArea.value = markdownArea.value.slice(0, pos) + markdownTag + markdownArea.value.slice(pos);
            markdownArea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          closeModal();
        } catch (err: any) {
          if (statusEl) { statusEl.className = 'text-xs text-danger'; statusEl.textContent = err.message || 'Upload failed.'; }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload & Insert';
        }
      };
    }
  });
}

export function attachCheckReferenceSolution(step: any): void {
  appEl.querySelectorAll<HTMLButtonElement>('[data-action="check-reference-solution"]').forEach((checkRefBtn) => checkRefBtn.addEventListener('click', async () => {
    const idleLabel = checkRefBtn.textContent || 'Check reference solution';
    const refCode = (appEl.querySelector('#ref-solution-input') as HTMLTextAreaElement | null)?.value || '';
    if (!refCode.trim()) {
      window.alert('Please enter a reference solution to validate.');
      return;
    }
    const sections = appEl.querySelectorAll('#tab-tests .test-cases-section');
    const readCurrentTests = (section: Element | undefined) =>
      Array.from(section?.querySelectorAll('.test-case-card') || []).map((row) => ({
        stdin: (row.querySelector('.test-stdin') as HTMLTextAreaElement)?.value || '',
        expectedStdout: (row.querySelector('.test-stdout') as HTMLTextAreaElement)?.value || '',
      }));
    const currentPublicTests = readCurrentTests(sections[0]);
    const currentHiddenTests = readCurrentTests(sections[1]);

    checkRefBtn.disabled = true;
    checkRefBtn.textContent = 'Running tests…';
    try {
      const result = await authClient.fetchApi(`/api/author/steps/${encodeURIComponent(step.id)}/check-reference`, {
        method: 'POST',
        body: JSON.stringify({
          referenceSolution: refCode,
          publicTests: currentPublicTests,
          hiddenTests: currentHiddenTests,
        }),
      });
      const badgeBox = appEl.querySelector('#tab-validation .section-header-row div:last-child');
      if (badgeBox) {
        badgeBox.innerHTML = result.allPassed
          ? '<span class="status-badge badge-success">Reference Solution Validated</span>'
          : '<span class="status-badge badge-warning">Validation Failed</span>';
      }
      appEl.querySelector('.sub-tab-btn[data-tab="validation"] .step-dot')?.setAttribute('data-state', result.allPassed ? 'complete' : 'error');
      let resultsTable = appEl.querySelector('#tab-validation .validation-results-table');
      if (!resultsTable) {
        resultsTable = document.createElement('div');
        resultsTable.className = 'validation-results-table mt-4';
        appEl.querySelector('#tab-validation')?.append(resultsTable);
      }
      resultsTable.innerHTML = `
              <h3 class="text-sm font-semibold">Test Results</h3>
              <table class="data-table mt-2">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${(result.validationResults || [])
                    .map(
                      (r: any) => `
                      <tr>
                        <td>${escapeHtml(r.name)}</td>
                        <td>${r.passed ? '<span class="text-success font-semibold">PASS</span>' : '<span class="text-danger font-semibold">FAIL</span>'}</td>
                        <td>${escapeHtml(r.error || (r.passed ? 'Passed within limits' : 'Failed'))}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            `;
      if (!checkRefBtn.closest('#tab-validation')) appEl.querySelector<HTMLElement>('.sub-tab-btn[data-tab="validation"]')?.click();
    } catch (err: any) {
      window.alert(err.message || 'Reference solution check failed.');
    } finally {
      checkRefBtn.disabled = false;
      checkRefBtn.textContent = idleLabel;
    }
  }));
}
