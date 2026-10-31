import { navigateTo, renderApp } from '../navigation.ts';
import { app } from '../state.ts';

export function clearAdminDialogState(dialog: HTMLDialogElement): void {
  if (!dialog.classList.contains('admin-modal-dialog')) return;
  dialog.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
    input.value = '';
  });
  dialog.querySelectorAll<HTMLInputElement>('input[name="reason"]').forEach((input) => {
    input.value = '';
  });
  dialog.querySelectorAll<HTMLElement>('.form-error').forEach((err) => {
    err.textContent = '';
    err.classList.add('hidden');
  });
  const replaceSelect = dialog.querySelector<HTMLSelectElement>('#edit-category-replacement-select, [name="replacementId"]');
  if (replaceSelect) {
    replaceSelect.value = '';
  }
  dialog.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((btn) => {
    const isWaiver = Boolean(btn.closest('form')?.querySelector('[data-waiver-step]'));
    const isReplaceRequired = Boolean(replaceSelect && replaceSelect.required && !replaceSelect.value);
    btn.disabled = Boolean(isWaiver || isReplaceRequired);
    if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
  });
  const waiverSelect = dialog.querySelector<HTMLSelectElement>('[data-waiver-step]');
  if (waiverSelect) {
    waiverSelect.value = '';
    const count = dialog.querySelector<HTMLInputElement>('[name="reviewedAffectedCount"]');
    if (count) count.value = '0';
    const review = dialog.querySelector<HTMLElement>('.waiver-review-count');
    if (review) review.textContent = 'Choose a step to review affected enrollments.';
  }
}

export function installAdminDocumentHandlers(): void {
  // Global click handler for internal SPA navigation and interactive widgets
  document.addEventListener('submit', async (event) => {
    const previewForm=(event.target as HTMLElement).closest('form[data-admin-preview]') as HTMLFormElement|null;
    if(previewForm){
      event.preventDefault();const values=Object.fromEntries(new FormData(previewForm).entries());const button=previewForm.querySelector('button') as HTMLButtonElement|null;if(button){button.disabled=true;button.textContent='Checking and loading…';}
      previewForm.querySelectorAll('.text-danger').forEach((f) => f.remove());
      try{
        const response=await fetch(previewForm.getAttribute('action')||'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
        if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error?.message||'Preview is unavailable.');}
        const blob=await response.blob();
        if(!blob.type.startsWith('image/'))throw new Error('The preview did not contain a safe image.');
        const src=URL.createObjectURL(blob);
        const dialog=document.createElement('dialog');
        dialog.className='admin-media-preview-dialog';
        dialog.setAttribute('aria-label', 'Authorized media preview');
        dialog.innerHTML=`<form method="dialog"><button class="btn btn-secondary">Close preview</button></form><img alt="Authorized media preview" src="${src}">`;
        document.body.append(dialog);
        dialog.addEventListener('close',()=>{URL.revokeObjectURL(src);dialog.remove();});
        dialog.showModal();
        previewForm.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((p) => { p.value = ''; });
      }
      catch(error:any){const feedback=document.createElement('p');feedback.className='text-danger';feedback.setAttribute('role','alert');feedback.textContent=error.message;previewForm.append(feedback);}
      finally{if(button){button.disabled=false;button.textContent='Safe preview';}}
      return;
    }
    const exportForm=(event.target as HTMLElement).closest('form[data-admin-export]') as HTMLFormElement|null;
    if(exportForm){
      event.preventDefault();const feedback=exportForm.querySelector('.form-error') as HTMLElement|null;const button=exportForm.querySelector('button[type="submit"]') as HTMLButtonElement|null;if(button){button.disabled=true;button.textContent='Preparing export…';}
      try{const response=await fetch(exportForm.getAttribute('action')||'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(exportForm).entries()))});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'The export could not be prepared.');if(feedback){feedback.classList.remove('hidden');feedback.classList.add('text-success');feedback.setAttribute('role','status');feedback.textContent=`Export is ready for the account owner in Privacy settings until ${new Date(result.expiresAt).toLocaleString()}.`;}if(button)button.textContent='Export prepared';}
      catch(error:any){if(feedback){feedback.textContent=error.message;feedback.classList.remove('hidden');}if(button){button.disabled=false;button.textContent='Prepare export for user';}}
      return;
    }
    const form = (event.target as HTMLElement).closest('form[data-admin-mutation]') as HTMLFormElement | null;
    if (!form) return;
    event.preventDefault();
    const action=form.getAttribute('action')||'';
    const method=(form.getAttribute('method')||'post').toUpperCase();
    const values=Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
    if(values.suspended!==undefined) values.suspended=String(values.suspended==='true');
    if(values.versionStep){ const [versionId,stepId]=values.versionStep.split('|');values.versionId=versionId;values.stepId=stepId;delete values.versionStep; }
    const feedback=form.querySelector('.form-error') as HTMLElement|null;
    const button=form.querySelector('button[type="submit"]') as HTMLButtonElement|null;
    if(button){button.disabled=true;button.dataset.label=button.textContent||'';button.textContent='Confirming…';}
    if(feedback){feedback.textContent='';feedback.classList.add('hidden');}
    try{
      const res=await fetch(action,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error?.message||'The administrator action could not be completed.');
      if(action==='/api/admin/support-access') { navigateTo(`/admin/users/${encodeURIComponent(body.userId)}?supportAccess=${encodeURIComponent(body.id)}`);return; }
      renderApp(window.location.pathname+window.location.search);
    }catch(error:any){
      if(feedback){feedback.textContent=error.message;feedback.classList.remove('hidden');}
      if(button){button.disabled=false;button.textContent=button.dataset.label||'Retry';}
    }
  });
  document.addEventListener('change', async (event) => {
    const replaceSelect = (event.target as HTMLElement).closest('#edit-category-replacement-select, [name="replacementId"]') as HTMLSelectElement | null;
    if (replaceSelect) {
      const dialog = replaceSelect.closest('dialog');
      const submitBtn = dialog?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn && replaceSelect.required) {
        submitBtn.disabled = !replaceSelect.value;
      }
    }

    const select=(event.target as HTMLElement).closest('[data-waiver-step]') as HTMLSelectElement|null;
    if(!select)return;
    const form=select.closest('form') as HTMLFormElement|null;if(!form)return;
    const [versionId,stepId]=(select.value||'').split('|');const action=form.getAttribute('action')||'';
    const output=form.querySelector('.waiver-review-count') as HTMLElement|null;const countField=form.querySelector('[name="reviewedAffectedCount"]') as HTMLInputElement|null;const button=form.querySelector('button[type="submit"]') as HTMLButtonElement|null;
    if(output)output.textContent='Checking affected enrollments…';if(button)button.disabled=true;
    try{const query=new URLSearchParams({versionId,stepId});const res=await fetch(`${action}?${query}`,{});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.error?.message||'Could not review waiver scope.');if(countField)countField.value=String(result.affectedCount);if(output)output.textContent=`${result.affectedCount} active enrollment(s) will be affected · ${result.scope}.`;if(button)button.disabled=result.affectedCount===0;}
    catch(error:any){if(countField)countField.value='0';if(output)output.textContent=error.message;if(button)button.disabled=true;}
  });

  document.addEventListener(
    'close',
    (event) => {
      const dialog = event.target as HTMLDialogElement | null;
      if (!dialog || dialog.tagName !== 'DIALOG' || !dialog.classList.contains('admin-modal-dialog') || dialog.open) return;
      clearAdminDialogState(dialog);
      if (app.lastActiveAdminTrigger && typeof app.lastActiveAdminTrigger.focus === 'function') {
        try {
          app.lastActiveAdminTrigger.focus();
        } catch {}
        app.lastActiveAdminTrigger = null;
      }
    },
    true
  );
}
