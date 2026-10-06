export interface PolicyPageProps {
  type: 'privacy' | 'terms';
}

export function renderPolicyPage(props: PolicyPageProps): string {
  const isPrivacy = props.type === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  return `
    <div class="policy-page container py-12">
      <div class="max-w-reading mx-auto">
        <header class="policy-header mb-8">
          <nav class="breadcrumb text-xs text-muted mb-4" aria-label="Breadcrumb">
            <a href="/" class="text-secondary hover:underline">Home</a>
            <span class="mx-2">/</span>
            <span class="text-primary font-medium" aria-current="page">${title}</span>
          </nav>
          <h1 class="page-title font-semibold mb-2">${title}</h1>
          <div class="policy-meta text-xs text-muted">
            Status: Pending publication
          </div>
        </header>

        <div class="card p-6 mb-8 border border-subtle bg-surface rounded-lg text-sm" role="status">
          <h2 class="text-base font-semibold text-primary mb-2">${isPrivacy ? 'The privacy policy is not yet available' : 'The terms of service are not yet available'}</h2>
          <p class="text-secondary text-sm leading-relaxed mb-6">
            Official ${isPrivacy ? 'privacy policy' : 'terms of service'} documentation is currently undergoing review prior to public release. Terms will be published here upon completion.
          </p>
          <div class="pt-4 border-t border-subtle flex gap-3">
            <a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>
            <a href="/help" class="btn btn-ghost btn-compact">Help and support</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
