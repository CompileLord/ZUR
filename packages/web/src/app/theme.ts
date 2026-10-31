export function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  localStorage.setItem('zur_theme_preference', theme);
  let resolved: 'dark' | 'light' = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;

  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

export function initTheme(): void {
  const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'dark';
  applyTheme(savedTheme);

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
  if (themeSelect) {
    themeSelect.value = savedTheme;
    if (!(themeSelect as any).__listenerAttached) {
      (themeSelect as any).__listenerAttached = true;
      themeSelect.addEventListener('change', (e) => {
        const selected = (e.target as HTMLSelectElement).value as 'dark' | 'light' | 'system';
        applyTheme(selected);
        initTheme();
      });
    }
  }

  const themeBtns = document.querySelectorAll('.theme-segment-btn');
  themeBtns.forEach((btn) => {
    const val = btn.getAttribute('data-theme-value');
    const isActive = val === savedTheme;
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    btn.classList.toggle('active', isActive);

    if (!(btn as any).__listenerAttached) {
      (btn as any).__listenerAttached = true;
      btn.addEventListener('click', () => {
        const selected = btn.getAttribute('data-theme-value') as 'dark' | 'light' | 'system';
        if (selected) {
          applyTheme(selected);
          initTheme();
        }
      });
    }
  });
}
