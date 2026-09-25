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
          <div class="policy-meta text-xs text-muted tabular-nums">
            Status: Blocked / Pending Legal Review · Not yet in effect
          </div>
        </header>

        <div class="banner banner-warning p-6 mb-8 border border-warning rounded-lg text-sm" role="status">
          <h2 class="text-base font-semibold text-warning mb-2">Pending Final Legal Counsel Approval</h2>
          <p class="text-secondary text-sm leading-relaxed mb-4">
            Official public legal terms and customer privacy policy terms are currently undergoing formal legal counsel review prior to general public release (PRD_V2.md §22, design.md P41). In accordance with engineering invariants, placeholder, drafted, or fabricated legal contract text is prohibited.
          </p>
          <p class="text-secondary text-sm leading-relaxed mb-4">
            Public external support contacts and formal legal terms will be published upon conclusion of legal review and operational sign-off.
          </p>
          <div class="pt-4 border-t border-subtle flex gap-3">
            <a href="/courses" class="btn btn-secondary btn-compact">Browse public courses</a>
            <a href="/help" class="btn btn-ghost btn-compact">Help &amp; support topics</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
