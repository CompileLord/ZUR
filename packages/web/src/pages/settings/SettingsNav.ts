export function renderSettingsNav(activeTab: 'profile' | 'appearance' | 'security' | 'privacy'): string {
  const tabs = [
    { id: 'profile', label: 'Profile', href: '/settings/profile' },
    { id: 'appearance', label: 'Appearance', href: '/settings/appearance' },
    { id: 'security', label: 'Security', href: '/settings/security' },
    { id: 'privacy', label: 'Privacy & account', href: '/settings/privacy' },
  ];

  const linksHtml = tabs
    .map(
      (tab) => `
      <a href="${tab.href}" class="tab-link ${tab.id === activeTab ? 'active' : ''}" aria-selected="${tab.id === activeTab}">
        ${tab.label}
      </a>
    `
    )
    .join('');

  return `
    <div class="settings-subnav mb-8 border-b border-subtle">
      <nav class="tabs-nav flex gap-6" role="tablist" aria-label="Settings categories">
        ${linksHtml}
      </nav>
    </div>
  `;
}
