import { renderAdminShell } from '../../components/shells/AdminShell.ts';

export function escapeAdmin(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}
const formField = (name:string,label:string,type='text',required=true) => `<label class="form-group"><span class="form-label">${escapeAdmin(label)}</span><input class="form-input" name="${escapeAdmin(name)}" type="${type}" ${required?'required':''}></label>`;
const adminForm = (action:string,content:string,button:string='Save changes',method='post') => `<form class="admin-mutation-form" data-admin-mutation action="${escapeAdmin(action)}" method="${escapeAdmin(method)}">${content}${formField('reason','Reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-primary" type="submit" ${action.endsWith('/waivers')?'disabled':''}>${escapeAdmin(button)}</button><p class="form-error hidden" role="alert"></p></form>`;
const table = (headers:string[],rows:string[],empty:string) => `<div class="data-table-wrapper"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${escapeAdmin(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" class="empty-state">${escapeAdmin(empty)}</td></tr>`}</tbody></table></div>`;
const pill=(text:string,kind='info')=>`<span class="status-badge ${kind}">${escapeAdmin(text)}</span>`;
const pageNav=(data:any,path:string)=>{if(!data||!Number.isFinite(data.total)||!Number.isFinite(data.limit))return '';const params=new URLSearchParams(path.split('?')[1]||'');const offset=Number(params.get('offset')||0),limit=data.limit;const link=(next:number,label:string)=>{const q=new URLSearchParams(params);q.set('offset',String(next));q.set('limit',String(limit));return `<a class="btn btn-secondary btn-compact" href="${escapeAdmin(`${path.split('?')[0]}?${q}`)}">${label}</a>`;};return `<nav class="admin-pagination" aria-label="Result pages"><span>Showing ${data.total?offset+1:0}–${Math.min(offset+data.items.length,data.total)} of ${data.total}</span>${offset>0?link(Math.max(0,offset-limit),'Previous'):''}${offset+limit<data.total?link(offset+limit,'Next'):''}</nav>`;};

export function renderAdminPage(path:string,data:any,error?:string,adminUser={displayName:'Administrator',email:''}):string {
  const route=path.split('?')[0];
  const title = route==='/admin'?'Platform status':route.startsWith('/admin/users')?'Users and capabilities':route.startsWith('/admin/courses')?'Course administration':route.startsWith('/admin/categories')?'Categories':route.startsWith('/admin/reports')?'Reports':route.startsWith('/admin/media')?'Media operations':route.startsWith('/admin/execution')?'Execution operations':'Audit';
  const err = error ? `<div class="alert alert-danger" role="alert">${escapeAdmin(error)} <button class="btn btn-secondary btn-compact" type="button" data-admin-retry>Retry</button></div>` : '';
  let content = `<section class="admin-page-content"><p class="text-secondary">Loading operational records…</p></section>`;
  if (data) {
    if(route==='/admin') {
      const errRate = data.internalErrorRate;
      let errRateDisplay = 'Unavailable';
      let errRateSub = 'Last 5 minutes (resets on restart)';
      if (errRate) {
        const numErrors = errRate.numerator ?? 0;
        const numRequests = errRate.denominator ?? 0;
        const windowLabel = errRate.windowLabel || (errRate.window === '5m' ? 'Last 5 minutes' : errRate.window) || 'Last 5 minutes';
        if (errRate.status === 'available' && errRate.rateFormatted) {
          errRateDisplay = errRate.rateFormatted;
          errRateSub = `${escapeAdmin(numErrors)} 5xx error${numErrors === 1 ? '' : 's'} / ${escapeAdmin(numRequests)} request${numRequests === 1 ? '' : 's'} · ${escapeAdmin(windowLabel)}`;
        } else {
          errRateDisplay = 'Unavailable';
          errRateSub = `Insufficient telemetry (${escapeAdmin(numRequests)} request${numRequests === 1 ? '' : 's'} in ${escapeAdmin(windowLabel)} · resets on restart)`;
        }
      } else if (typeof data.internalErrors === 'number') {
        errRateDisplay = 'Unavailable';
        errRateSub = `${escapeAdmin(data.internalErrors)} 5xx error${data.internalErrors === 1 ? '' : 's'} recorded (no denominator)`;
      }
      content = `<section><p class="text-secondary">Platform status · refreshed ${escapeAdmin(data.refreshedAt)}</p>${data.operational?`<section aria-labelledby="ops-alert-title"><h2 id="ops-alert-title">Operational alerts</h2>${data.operational.alerts.length?`<ul class="ops-alert-list">${data.operational.alerts.map((alert:any)=>`<li class="ops-alert ${alert.severity==='critical'?'critical':''}" role="${alert.severity==='critical'?'alert':'status'}"><strong>${escapeAdmin(alert.code)}</strong> ${escapeAdmin(alert.message)}</li>`).join('')}</ul>`:'<p role="status">No active threshold alerts.</p>'}<p class="text-muted">Request samples are in memory and reset on process restart. p95 values use the last five minutes; no request payloads or user identifiers are retained.</p><details id="recent-request-metrics"><summary>Recent request metrics</summary>${table(['Service','Requests','Failures','p95 latency'],Object.entries(data.operational.requestMetrics.recentByFamily).map(([name,metric]:any)=>`<tr><th scope="row">${escapeAdmin(name)}</th><td>${metric.requests}</td><td>${metric.failures}</td><td>${metric.p95LatencyMs===null?'Unavailable':`${metric.p95LatencyMs} ms`}</td></tr>`),'No requests observed in the current window.')}</details></section>`:''}<div class="admin-ops-grid">
      <article class="admin-overview-card"><h2>Execution</h2>${pill(data.execution.paused?'Disabled':'Available',data.execution.paused?'warning':'success')}<p>New Python jobs ${data.execution.paused?'are paused':'can be accepted'}.${data.executionInfrastructureErrors ? ` ${escapeAdmin(data.executionInfrastructureErrors.failures)} runner failure${data.executionInfrastructureErrors.failures === 1 ? '' : 's'} in 24h.` : ''}</p><a href="/admin/execution">Execution operations</a></article>
      <article class="admin-overview-card"><h2>Queue</h2><strong>${data.queue.queued} queued · ${data.queue.running} running</strong><p>Oldest queued: ${escapeAdmin(data.queue.oldestQueuedAt||'No queued jobs')}</p><a href="/admin/execution">Review jobs</a></article>
      <article class="admin-overview-card"><h2>Runner telemetry</h2>${pill(data.workers.health,data.workers.lastObservedAt?'info':'warning')}<p>Last observed: ${escapeAdmin(data.workers.lastObservedAt||'Unavailable')}</p></article>
      <article class="admin-overview-card"><h2>Internal-error rate</h2><strong>${errRateDisplay}</strong><p>${errRateSub}</p>${data.operational ? '<a href="#recent-request-metrics">Recent request metrics</a>' : ''}</article>
      <article class="admin-overview-card"><h2>Outstanding reports</h2><strong>${data.openReports}</strong><p><a href="/admin/reports">Open report triage</a></p></article>
      <article class="admin-overview-card"><h2>Email delivery</h2><strong>${data.emailDeliveryIssues} issue(s)</strong><p>${escapeAdmin(data.email?.status||'No delivery data')} · last sent ${escapeAdmin(data.email?.lastSentAt||'unavailable')}</p><a href="/admin/users">Review account records</a></article>
    </div><p class="text-muted">Telemetry status: queue ${escapeAdmin(data.telemetry.queue)}, worker heartbeat ${escapeAdmin(data.telemetry.workerHeartbeat)}, email ${escapeAdmin(data.telemetry.email)}, internal errors ${escapeAdmin(data.telemetry.internalErrorRate||'unavailable')}.</p></section>`;
    }
    else if(route==='/admin/users') {
      const rows=(data.items||[]).map((u:any)=>`<tr><td><a href="/admin/users/${encodeURIComponent(u.id)}">${escapeAdmin(u.displayName)}</a></td><td>${escapeAdmin(u.email)}</td><td>${u.emailVerified?'Verified':'Unverified'}</td><td>${escapeAdmin(u.capabilities.join(', '))}</td><td>${pill(u.accountStatus,u.accountStatus==='active'?'success':'warning')}</td><td>${escapeAdmin(u.createdAt)}</td></tr>`);
      const searchParams=new URLSearchParams(path.split('?')[1]||'');
      content=`<form class="admin-filter-form"><label>Search <input class="form-input" name="search" value="${escapeAdmin(searchParams.get('search'))}"></label><label>Status <select name="status" class="form-input"><option value="">All</option>${['active','suspended','pending_deletion','purged'].map(s=>`<option value="${s}" ${searchParams.get('status')===s?'selected':''}>${s}</option>`).join('')}</select></label><button class="btn btn-secondary">Search</button></form>${table(['User','Email','Verification','Capabilities','Account state','Created'],rows,'No matching users.')}${pageNav(data,path)}`;
    } else if(route.startsWith('/admin/users/')) {
      const u=data.user; const actions=['grant-author','revoke-author','suspend','restore'];
      const supported = data.supportRecords;
      content=`<p><a href="/admin/users">← Users</a></p><h2>${escapeAdmin(u.displayName)}</h2><dl><dt>Email</dt><dd>${escapeAdmin(u.email)}</dd><dt>Capabilities</dt><dd>${escapeAdmin(u.capabilities.join(', '))}</dd><dt>Account state</dt><dd>${pill(u.accountStatus,u.accountStatus==='active'?'success':'warning')}</dd><dt>Verified</dt><dd>${u.emailVerified?'Yes':'No'}</dd></dl><h3>Access controls</h3><div class="admin-ops-grid">${actions.map(action=>adminForm(`/api/admin/users/${encodeURIComponent(u.id)}/${action}`,`<input type="hidden" name="action" value="${action}">`,action.replace('-',' '))).join('')}</div><h3>Support access to learning records</h3>${(data.enrollments||[]).map((e:any)=>`<section class="admin-overview-card"><h4>${escapeAdmin(e.title)} · ${escapeAdmin(e.status)} · pinned version ${escapeAdmin(e.pinnedVersionId)}</h4>${adminForm('/api/admin/support-access',`<input type="hidden" name="userId" value="${escapeAdmin(u.id)}"><input type="hidden" name="courseId" value="${escapeAdmin(e.courseId)}">`,'Start 30-minute support access')}</section>`).join('')}${supported?`<aside class="alert alert-warning" role="status"><strong>Audited support access is active.</strong> ${escapeAdmin(supported.support.reason)} · expires ${escapeAdmin(supported.support.expiresAt)} · ${escapeAdmin(supported.course.title)}. ${adminForm(`/api/admin/support-access/${encodeURIComponent(supported.support.grantId)}/revoke`,'','End support access')}</aside><h3>Learning records · ${escapeAdmin(supported.course.title)}</h3>${supported.enrollments.map((e:any)=>`<section class="admin-overview-card"><h4>Version ${e.versionNumber} · ${escapeAdmin(e.status)}</h4>${table(['Step','State','Evidence'],e.progress.map((p:any)=>`<tr><td>${escapeAdmin(p.title||p.stepId)}</td><td>${p.isWaived?'Waived':p.isCompleted?'Completed':'Not complete'}</td><td>${escapeAdmin(p.waiverReason||p.completedAt||'—')}</td></tr>`),'No progress records.')}${table(['Attempt','Step','Verdict','Date'],e.attempts.map((a:any)=>`<tr><td>${a.attemptNumber}</td><td>${escapeAdmin(a.stepId)}</td><td>${escapeAdmin(a.verdict)}</td><td>${escapeAdmin(a.createdAt)}</td></tr>`),'No assessment attempts.')}</section>`).join('')}`:''}<h3>Privacy requests</h3>${table(['Type','Status','Blocker','Created','Support action'],(data.privacyRequests||[]).map((r:any)=>`<tr><td>${escapeAdmin(r.request_type)}</td><td>${escapeAdmin(r.status)}</td><td>${escapeAdmin(r.blocker_reason||'—')}</td><td>${escapeAdmin(r.created_at)}</td><td>${r.request_type==='deletion'&&['pending','submitted'].includes(r.status)?adminForm(`/api/admin/privacy-requests/${encodeURIComponent(r.id)}`,'','Purge account after review'):r.request_type==='export'&&['pending','submitted'].includes(r.status)?`<form class="admin-mutation-form" data-admin-export action="/api/admin/privacy-requests/${encodeURIComponent(r.id)}/export" method="post">${formField('reason','Export fulfillment reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-primary" type="submit">Prepare export for user</button><p class="form-error hidden" role="alert"></p></form>`:adminForm(`/api/admin/privacy-requests/${encodeURIComponent(r.id)}`,`<select class="form-input" name="status"><option>pending</option><option>failed</option></select>`,'Update request status','patch')}</td></tr>`),'No privacy requests.')}`;
    } else if(route==='/admin/courses') {
      const rows=(data.items||[]).map((c:any)=>`<tr><td><a href="/admin/courses/${encodeURIComponent(c.id)}">${escapeAdmin(c.title)}</a></td><td>${escapeAdmin(c.owner_name)}</td><td>${escapeAdmin(c.publication_status)}</td><td>${escapeAdmin(c.visibility)}</td><td>${escapeAdmin(c.latest_version??'—')}</td><td>${c.is_suspended?'Suspended':'Available'}</td><td>${c.open_reports}</td></tr>`);
      content=`<form class="admin-filter-form"><label>Search <input class="form-input" name="search"></label><button class="btn btn-secondary">Search</button></form>${table(['Course','Owner','Publication','Visibility','Latest version','Availability','Open reports'],rows,'No matching courses.')}${pageNav(data,path)}`;
    } else if(route.startsWith('/admin/courses/')) {
      const query = new URLSearchParams(path.split('?')[1]||'');
      const targetVersionId = query.get('versionId');
      const targetStepId = query.get('stepId');
      const targetVersion = targetVersionId && data.versions ? data.versions.find((v:any)=>v.id===targetVersionId) : null;
      const targetStep = targetVersion && targetStepId ? targetVersion.steps.find((s:any)=>s.id===targetStepId) : null;

      let inspectionBanner = '';
      let snapshotInspectionPanel = '';
      if (targetVersionId) {
        if (!targetVersion) {
          inspectionBanner = `<aside class="alert alert-warning my-3" role="status"><strong>Requested immutable version not found:</strong> Version snapshot <code>${escapeAdmin(targetVersionId)}</code> is not recorded for this course.</aside>`;
        } else {
          const isLatest = targetVersion.versionNumber === data.latestVersion;
          let stepInspection = '';
          if (targetStep) {
            const problemHtml = targetStep.content?.problemStatement
              ? `<div class="step-detail-problem mt-2"><strong class="text-xs text-muted uppercase">Problem statement:</strong><p class="text-sm mt-1">${escapeAdmin(targetStep.content.problemStatement)}</p></div>`
              : '';
            const starterHtml = targetStep.content?.starterCode
              ? `<div class="step-detail-starter mt-2"><strong class="text-xs text-muted uppercase">Starter code:</strong><pre class="p-2 bg-canvas border border-subtle rounded text-xs overflow-x-auto">${escapeAdmin(targetStep.content.starterCode)}</pre></div>`
              : '';
            stepInspection = `<div class="target-step-card border border-subtle p-3 rounded mt-2 bg-subtle" data-inspected-step="${escapeAdmin(targetStep.id)}"><h4 class="text-sm font-semibold mb-1">Target step snapshot: ${escapeAdmin(targetStep.title)}</h4><p class="text-xs text-secondary mb-1">${escapeAdmin(targetStep.moduleTitle || 'Module')} › ${escapeAdmin(targetStep.lessonTitle || 'Lesson')} · Type: <code>${escapeAdmin(targetStep.type)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>${problemHtml}${starterHtml}</div>`;
          }

          snapshotInspectionPanel = `
            <section class="exact-version-inspection-panel border border-accent p-3 rounded my-3" data-inspected-version="${escapeAdmin(targetVersion.id)}" role="region" aria-label="Exact Version Inspection">
              <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 class="text-sm font-bold">Version ${escapeAdmin(targetVersion.versionNumber)} · ${isLatest ? 'Latest' : 'Historical'}${targetStep ? ` · ${escapeAdmin(targetStep.title)}` : ''}</h3>
                <span class="status-badge ${isLatest ? 'success' : 'warning'}">${isLatest ? 'Latest release' : 'Historical'}</span>
              </div>
              ${stepInspection}
              <details class="text-xs text-muted mt-2">
                <summary class="cursor-pointer font-medium py-1">Technical snapshot details</summary>
                <div class="mt-1 pl-2 border-l border-subtle space-y-1">
                  <p>Version ID: <code>${escapeAdmin(targetVersion.id)}</code></p>
                  <p>Published: ${escapeAdmin(targetVersion.createdAt)}</p>
                  ${targetStep ? `<p>Step ID: <code>${escapeAdmin(targetStep.id)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>` : ''}
                </div>
              </details>
            </section>
          `;
        }
      }

      const versionOptions = (data.versions||[]).flatMap((v:any)=>(v.steps||[]).filter((s:any)=>s.isRequired).map((s:any)=>{
        const val = `${v.id}|${s.id}`;
        const isSelected = (targetVersionId === v.id && targetStepId === s.id);
        return `<option value="${escapeAdmin(val)}" ${isSelected ? 'selected' : ''}>Version ${v.versionNumber} · ${escapeAdmin(s.title)}</option>`;
      })).join('');

      const versionsList = (data.versions||[]).map((v:any)=>`<li>Version ${v.versionNumber} (${escapeAdmin(v.id)}) · Published ${escapeAdmin(v.createdAt)} · <a href="/admin/courses/${encodeURIComponent(data.id)}?versionId=${encodeURIComponent(v.id)}" class="underline text-xs">Inspect exact snapshot</a></li>`).join('');

      content=`<p><a href="/admin/courses">← Courses</a></p><h2>${escapeAdmin(data.title)}</h2>${inspectionBanner}${snapshotInspectionPanel}<dl><dt>Owner</dt><dd>${escapeAdmin(data.ownerName)} · ${escapeAdmin(data.ownerEmail)}</dd><dt>Published release</dt><dd>Version ${escapeAdmin(data.latestVersion||'—')}</dd><dt>Active enrollments</dt><dd>${data.activeEnrollments}</dd><dt>Open reports</dt><dd>${data.openReports}</dd><dt>State</dt><dd>${data.isSuspended?'Suspended':'Available'}</dd></dl>${data.ownerDeletionPending&&data.publicationStatus!=='archived'?`<aside class="alert alert-warning"><strong>Owner deletion request is pending.</strong> Archiving this course will unblock deletion after the retention period. ${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/archive-for-deletion`,'','Archive to resolve ownership blocker')}</aside>`:''}<h3>Immutable published releases</h3><ul class="text-sm list-disc pl-5 mb-4">${versionsList||'<li>No published releases yet.</li>'}</ul><h3>Availability</h3>${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/suspension`,`<label class="form-group"><span class="form-label">Action</span><select class="form-input" name="suspended"><option value="${!data.isSuspended}">${data.isSuspended?'Restore availability':'Suspend course'}</option></select></label>`,'Apply availability change')}<h3>Waive a broken required step</h3><p>Only active enrollments pinned to the selected immutable version can be affected. This satisfies progress without awarding a pass. The affected count is rechecked before commit.</p>${adminForm(`/api/admin/courses/${encodeURIComponent(data.id)}/waivers`,`<label class="form-group"><span>Version and required step</span><select class="form-input" name="versionStep" data-waiver-step required>${versionOptions}</select></label><input type="hidden" name="reviewedAffectedCount" value="0"><p class="waiver-review-count" role="status">Choose a step to review affected enrollments.</p>`,'Review and apply waiver')}`;
    } else if(route==='/admin/categories') {
      const rows=(data.items||[]).map((c:any)=>`<tr><td>${escapeAdmin(c.name)}</td><td>${c.usageCount}</td><td><details><summary>Edit</summary>${adminForm(`/api/admin/categories/${encodeURIComponent(c.id)}`,`<input class="form-input" name="name" value="${escapeAdmin(c.name)}">`,'Save category','put')}${c.usageCount?`<p>In use by ${c.usageCount} courses. Reassign first.</p><form data-admin-mutation action="/api/admin/categories/${encodeURIComponent(c.id)}" method="delete">${formField('replacementId','Replacement category ID')}${formField('reason','Reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-danger">Reassign and remove</button></form>`:`<form data-admin-mutation action="/api/admin/categories/${encodeURIComponent(c.id)}" method="delete">${formField('reason','Reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-danger">Remove</button></form>`}</details></td></tr>`);
      content=`${adminForm('/api/admin/categories','<label class="form-group"><span>Name</span><input class="form-input" name="name" required></label>','Create category')}${table(['Category','Course usage','Actions'],rows,'No categories.')}`;
    } else if(route==='/admin/reports') {
      const rows=(data.items||[]).map((r:any)=>`<tr><td><a href="/admin/reports/${encodeURIComponent(r.id)}">${escapeAdmin(r.type)}</a></td><td>${escapeAdmin(r.courseTitle)}</td><td>${escapeAdmin(r.reporterName)}</td><td>${escapeAdmin(r.status)}</td><td>${escapeAdmin(r.createdAt)}</td></tr>`);
      content=`<form class="admin-filter-form"><label>Status <select class="form-input" name="status"><option value="">All</option><option>open</option><option>investigating</option><option>resolved</option></select></label><button class="btn btn-secondary">Filter</button></form>${table(['Type','Course','Reporter','Status','Submitted'],rows,'No reports in this view.')}${pageNav(data,path)}`;
    } else if(route.startsWith('/admin/reports/')) {
      const hasValidVersion = Boolean(data.courseVersionId && data.versionDetails);
      const versionLabel = data.versionNumber ? `Version ${data.versionNumber}` : (data.courseVersionId || 'Unavailable');
      const versionParam = hasValidVersion ? `versionId=${encodeURIComponent(data.courseVersionId)}` : '';
      const stepParam = (hasValidVersion && data.stepId) ? `&stepId=${encodeURIComponent(data.stepId)}` : '';
      const targetCourseUrl = (data.courseId && hasValidVersion)
        ? `/admin/courses/${encodeURIComponent(data.courseId)}?${versionParam}${stepParam}`
        : null;

      const versionLinkHtml = targetCourseUrl
        ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-version-link font-medium underline" data-report-version-link>${escapeAdmin(versionLabel)}${data.versionDetails ? (data.versionDetails.isLatest ? ' (latest published)' : ' (historical version, not newest)') : ''}</a>`
        : `<span class="text-muted" data-report-version-unavailable>Unavailable — no version snapshot recorded</span>`;

      const stepLabel = data.stepTitle ? `${data.stepTitle} (${data.stepId})` : (data.stepId || 'Course-level');
      const stepLinkHtml = data.stepId
        ? (targetCourseUrl
            ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-step-link font-medium underline" data-report-step-link>${escapeAdmin(stepLabel)}</a>`
            : `<span class="text-muted" data-report-step-unavailable>${escapeAdmin(stepLabel)}</span>`)
        : `<span class="text-muted">Course-level report</span>`;

      content=`<p><a href="/admin/reports">← Reports</a></p><h2>${escapeAdmin(data.type)} · ${escapeAdmin(data.courseTitle)}</h2><p>${escapeAdmin(data.description)}</p><div class="report-context-panel border border-subtle p-3 rounded my-3"><h3 class="text-sm font-semibold mb-2">Reported learning context</h3><p class="text-sm mb-1"><strong>Course:</strong> <a href="/admin/courses/${encodeURIComponent(data.courseId)}" class="underline">${escapeAdmin(data.courseTitle)}</a></p><p class="text-sm mb-1"><strong>Immutable version:</strong> ${versionLinkHtml}</p><p class="text-sm mb-1"><strong>Step:</strong> ${stepLinkHtml}</p>${data.versionDetails?.createdAt ? `<p class="text-xs text-muted mt-2">Pinned to version published ${escapeAdmin(data.versionDetails.createdAt)}.</p>` : ''}</div>${data.submittedCode?`<details><summary>Consented submitted code</summary><pre>${escapeAdmin(data.submittedCode)}</pre></details>`:''}<p>Status: ${escapeAdmin(data.status)}</p><form data-admin-mutation action="/api/admin/reports/${encodeURIComponent(data.id)}" method="patch"><label class="form-group"><span>Status</span><select name="status" class="form-input"><option>open</option><option>investigating</option><option>resolved</option></select></label>${formField('outcome','Resolution outcome', 'text',false)}<label class="form-group"><span>Internal notes</span><textarea class="form-input" name="internalNotes"></textarea></label>${formField('reason','Reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-primary">Update report</button></form>`;
    } else if(route==='/admin/media') {
      const rows=(data.items||[]).map((a:any)=>`<tr><td>${escapeAdmin(a.id)}</td><td>${escapeAdmin(a.courseTitle)}</td><td>${escapeAdmin(a.mimeType)} · ${Math.ceil(a.fileSize/1024)} KB</td><td>${escapeAdmin(a.processingStatus)}</td><td>${a.referenceCount}</td><td>${a.processingStatus==='ready'?`<form data-admin-preview action="/api/admin/media/${encodeURIComponent(a.id)}/preview" method="post">${formField('reason','Preview review reason')}${formField('currentPassword','Confirm administrator password','password')}<button class="btn btn-secondary">Safe preview</button></form>`:''}${adminForm(`/api/admin/media/${encodeURIComponent(a.id)}/${a.processingStatus==='quarantined'?'restore':'quarantine'}`,'','Apply review')}${a.processingStatus==='quarantined'&&a.referenceCount===0?adminForm(`/api/admin/media/${encodeURIComponent(a.id)}`,'','Delete unreferenced asset','delete'):''}</td></tr>`);
      content=table(['Asset','Course','Type / size','Processing','References','Review'],rows,'No media assets.')+pageNav(data,path);
    } else if(route==='/admin/execution') {
      const jobs=data.jobs?.items||[]; const rows=jobs.map((j:any)=>`<tr><td>${escapeAdmin(j.id)}</td><td>${escapeAdmin(j.jobType)}</td><td>${escapeAdmin(j.status)}</td><td>${escapeAdmin(j.createdAt)}</td><td>${escapeAdmin(j.updatedAt)}</td></tr>`);
      const query=new URLSearchParams(path.split('?')[1]||'');
      content=`<div class="admin-overview-card"><h2>New execution ${data.overview.execution.paused?'disabled':'enabled'}</h2><p>Disabling accepts no new jobs. Reading and saved code remain available.</p>${adminForm(`/api/admin/execution/${data.overview.execution.paused?'resume':'pause'}`,'',data.overview.execution.paused?'Reactivate execution':'Disable new execution')}</div><h2>Queue and worker health</h2><p>${data.overview.queue.queued} queued · ${data.overview.queue.running} running · oldest ${escapeAdmin(data.overview.queue.oldestQueuedAt||'none')}</p><form class="admin-filter-form"><label>From <input type="date" name="from" value="${escapeAdmin(query.get('from'))}"></label><label>To <input type="date" name="to" value="${escapeAdmin(query.get('to'))}"></label><button class="btn btn-secondary">Filter jobs</button></form>${table(['Job reference','Type','State','Accepted','Updated'],rows,'No execution jobs in this time range.')}${pageNav(data.jobs,path)}`;
    } else if(route==='/admin/audit') {
      const rows=(data.items||[]).map((e:any)=>`<tr><td>${escapeAdmin(e.createdAt)}</td><td>${escapeAdmin(e.actorName)}</td><td><a href="/admin/audit/${encodeURIComponent(e.id)}">${escapeAdmin(e.action)}</a></td><td>${escapeAdmin(e.targetType)} · ${escapeAdmin(e.targetId)}</td><td>${escapeAdmin(e.reason)}</td><td>${escapeAdmin(e.correlationId)}</td></tr>`);
      const query=new URLSearchParams(path.split('?')[1]||'');
      const filter=(name:string,label:string,type='text')=>`<label>${label} <input name="${name}" type="${type}" class="form-input" value="${escapeAdmin(query.get(name))}"></label>`;
      content=`<form class="admin-filter-form">${filter('actorId','Actor ID')}${filter('action','Action')}${filter('targetType','Target type')}${filter('targetId','Target ID')}${filter('reason','Reason contains')}${filter('correlationId','Correlation ID')}${filter('from','From','date')}${filter('to','To','date')}<button class="btn btn-secondary">Search audit</button></form>${table(['Time','Actor','Action','Target','Reason','Correlation'],rows,'No audit events match these filters.')}${pageNav(data,path)}`;
    } else if(route.startsWith('/admin/audit/')) {
      content=`<p><a href="/admin/audit">← Audit</a></p><h2>${escapeAdmin(data.action)}</h2>${table(['Field','Value'],Object.entries(data).filter(([key])=>key!=='metadata').map(([key,value])=>`<tr><th scope="row">${escapeAdmin(key)}</th><td>${escapeAdmin(value)}</td></tr>`),'No event details.')}${data.metadata?`<h3>Permitted structured changes</h3><pre>${escapeAdmin(JSON.stringify(data.metadata,null,2))}</pre>`:''}`;
    }
  }
  return renderAdminShell({activePath:path.split('?')[0],adminUser,headerTitle:title,content:`<div class="admin-page-content">${err}${content}</div>`});
}
