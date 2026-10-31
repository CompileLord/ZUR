import { renderPublicShell } from '../../components/shells/index.ts';
import { type CatalogPageProps } from '../../pages/public/CatalogPage.ts';
import { navigateTo, renderApp } from '../navigation.ts';
import { courseClient, authClient, appEl } from '../state.ts';
import { alertDialog } from '../../components/common/Dialog.ts';

export function attachCatalogListeners(catalogState: CatalogPageProps): void {
  // Search form submit & debounced search input
  const searchForm = document.getElementById('catalog-search-form') as HTMLFormElement | null;
  const searchInput = document.getElementById('catalog-search-input') as HTMLInputElement | null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const val = searchInput.value.trim();
        const url = new URL(window.location.href);
        const currentQ = url.searchParams.get('q') || '';
        if (val !== currentQ) {
          if (val) {
            url.searchParams.set('q', val);
          } else {
            url.searchParams.delete('q');
          }
          url.searchParams.delete('page');
          navigateTo(url.pathname + url.search);
        }
      }, 300);
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      const val = searchInput.value.trim();
      const url = new URL(window.location.href);
      if (val) {
        url.searchParams.set('q', val);
      } else {
        url.searchParams.delete('q');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  // Filter dropdowns
  const filterCat = document.getElementById('filter-category') as HTMLSelectElement | null;
  if (filterCat) {
    filterCat.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterCat.value) {
        url.searchParams.set('category', filterCat.value);
      } else {
        url.searchParams.delete('category');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  const filterLevel = document.getElementById('filter-level') as HTMLSelectElement | null;
  if (filterLevel) {
    filterLevel.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterLevel.value) {
        url.searchParams.set('level', filterLevel.value);
      } else {
        url.searchParams.delete('level');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  const filterLang = document.getElementById('filter-language') as HTMLSelectElement | null;
  if (filterLang) {
    filterLang.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterLang.value) {
        url.searchParams.set('language', filterLang.value);
      } else {
        url.searchParams.delete('language');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  // Clear filters button (multiple could exist: desktop button, mobile clear, empty state clear button)
  const clearButtons = document.querySelectorAll('[data-action="clear-filters"], #btn-clear-filters');
  clearButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo('/courses');
    });
  });

  // Pagination buttons
  const prevBtn = document.querySelector('[data-action="prev-page"]');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const curPage = Math.max(1, catalogState.filters.page || 1);
      if (curPage > 1) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', String(curPage - 1));
        navigateTo(url.pathname + url.search);
      }
    });
  }

  const nextBtn = document.querySelector('[data-action="next-page"]');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const curPage = Math.max(1, catalogState.filters.page || 1);
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(curPage + 1));
      navigateTo(url.pathname + url.search);
    });
  }

  // Mobile Filter Sheet: keyboard accessible with focus entry, Escape close, and focus restoration
  const mobileSheet = document.getElementById('mobile-filter-sheet');
  const openSheetBtn = document.querySelector('[data-action="open-sheet"]');
  const closeSheetBtns = document.querySelectorAll('[data-action="close-sheet"]');
  const applyMobileBtn = document.querySelector('[data-action="apply-mobile-filters"]');

  let mobileTriggerElement: HTMLElement | null = null;

  const handleMobileSheetKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMobileSheet();
    }
  };

  function openMobileSheet(): void {
    if (!mobileSheet) return;
    catalogState.isMobileFilterOpen = true;
    mobileTriggerElement = document.activeElement as HTMLElement | null;
    mobileSheet.style.display = 'flex';
    mobileSheet.classList.add('open');
    document.addEventListener('keydown', handleMobileSheetKeyDown);
    const firstInput = mobileSheet.querySelector('select, input, button') as HTMLElement | null;
    firstInput?.focus();
  }

  function closeMobileSheet(): void {
    if (!mobileSheet) return;
    catalogState.isMobileFilterOpen = false;
    mobileSheet.style.display = 'none';
    mobileSheet.classList.remove('open');
    document.removeEventListener('keydown', handleMobileSheetKeyDown);
    mobileTriggerElement?.focus();
  }

  if (openSheetBtn) {
    openSheetBtn.addEventListener('click', openMobileSheet);
  }

  closeSheetBtns.forEach((btn) => {
    btn.addEventListener('click', closeMobileSheet);
  });

  if (applyMobileBtn) {
    applyMobileBtn.addEventListener('click', () => {
      const mobileCat = (document.getElementById('mobile-filter-category') as HTMLSelectElement | null)?.value;
      const mobileLevel = (document.getElementById('mobile-filter-level') as HTMLSelectElement | null)?.value;
      const mobileLang = (document.getElementById('mobile-filter-language') as HTMLSelectElement | null)?.value;

      const url = new URL(window.location.href);
      if (mobileCat) url.searchParams.set('category', mobileCat);
      else url.searchParams.delete('category');

      if (mobileLevel) url.searchParams.set('level', mobileLevel);
      else url.searchParams.delete('level');

      if (mobileLang) url.searchParams.set('language', mobileLang);
      else url.searchParams.delete('language');

      url.searchParams.delete('page');
      closeMobileSheet();
      navigateTo(url.pathname + url.search);
    });
  }

  // Retry button: keeps query/filter URL state
  const retryBtn = document.querySelector('[data-action="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      renderApp(window.location.pathname + window.location.search);
    });
  }
}

export function attachCourseOverviewListeners(courseId: string): void {
  // Retry button for service failures: re-renders overview route
  const retryBtn = document.querySelector('[data-action="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      renderApp(window.location.pathname + window.location.search);
    });
  }

  const enrollBtns = document.querySelectorAll<HTMLButtonElement>('[data-action="enroll-course"], #btn-enroll-course');
  enrollBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      enrollBtns.forEach((b) => {
        b.disabled = true;
        b.textContent = 'Enrolling…';
      });

      try {
        const enrollment = await courseClient.enrollInCourse(courseId);
        navigateTo(`/learn/${encodeURIComponent(enrollment.id)}`);
      } catch (err: any) {
        enrollBtns.forEach((b) => {
          b.disabled = false;
          b.textContent = 'Enroll in course';
        });
        void alertDialog(err.message || 'Failed to enroll in course. Please try again.');
      }
    });
  });
}
