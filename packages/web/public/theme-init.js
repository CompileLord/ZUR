// Dark-first first-paint script (design.md §3.1). External so a strict CSP (script-src 'self') works.
(function () {
  try {
    var preference = localStorage.getItem('zur_theme_preference') || 'dark';
    var resolvedTheme = 'dark'; // Dark is default for first visits

    if (preference === 'light') {
      resolvedTheme = 'light';
    } else if (preference === 'dark') {
      resolvedTheme = 'dark';
    } else if (preference === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        resolvedTheme = 'light';
      } else {
        resolvedTheme = 'dark';
      }
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
