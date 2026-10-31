import { renderPublicShell } from '../../components/shells/index.ts';
import { type CatalogPageProps } from '../../pages/public/CatalogPage.ts';
import { renderHelpPage } from '../../pages/public/HelpPage.ts';
import { navigateTo, renderApp } from '../navigation.ts';
import { courseClient, authClient, appEl } from '../state.ts';

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
        await courseClient.enrollInCourse(courseId);
        navigateTo('/learn');
      } catch (err: any) {
        enrollBtns.forEach((b) => {
          b.disabled = false;
          b.textContent = 'Enroll in course';
        });
        alert(err.message || 'Failed to enroll in course. Please try again.');
      }
    });
  });
}

export function attachHelpListeners(courseId?: string, triggerElement?: HTMLElement | null): void {
  const modal = document.getElementById('report-issue-modal');
  const openBtns = document.querySelectorAll<HTMLElement>('[data-action="open-report"]');
  const closeBtns = document.querySelectorAll<HTMLElement>('[data-action="close-report"]');
  const form = document.getElementById('report-issue-form') as HTMLFormElement | null;

  let helpTriggerElement: HTMLElement | null = triggerElement || (openBtns.length > 0 ? openBtns[0] : null);

  // Course picker: swap the free-text Course ID for a select of the user's enrolled courses.
  const courseInput = document.getElementById('report-course-id') as HTMLInputElement | null;
  if (courseInput && authClient.getUser()) {
    void authClient.fetchApi('/api/student/courses').then((res: any) => {
      const seen = new Set<string>();
      const options = (res?.enrollments || []).filter((e: any) => e.courseId && !seen.has(e.courseId) && seen.add(e.courseId));
      if (!options.length || !courseInput.isConnected) return;
      const select = document.createElement('select');
      select.id = 'report-course-id';
      select.className = courseInput.className;
      select.required = true;
      const current = courseInput.value;
      const mk = (value: string, label: string) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
      if (!current) select.appendChild(mk('', 'Choose a course'));
      if (current && !seen.has(current)) select.appendChild(mk(current, current));
      for (const e of options) select.appendChild(mk(e.courseId, e.courseTitle || e.title || e.courseId));
      select.value = current;
      courseInput.replaceWith(select);
      const lbl = document.querySelector('label[for="report-course-id"]'); if (lbl) lbl.innerHTML = 'Course <span class="text-danger">*</span>';
      const hint = select.parentElement?.querySelector('.form-hint');
      if (hint) hint.textContent = 'The course this report is about.';
    }).catch(() => { /* keep the text field */ });
  }

  const getFocusableElements = (): HTMLElement[] => {
    if (!modal) return [];
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');
    return Array.from(modal.querySelectorAll<HTMLElement>(selectors)).filter(
      (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  };

  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeReportModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || !modal?.contains(document.activeElement)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl || !modal?.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  };

  function openReportModal(trigger?: HTMLElement): void {
    if (!modal) return;
    if (trigger) {
      helpTriggerElement = trigger;
    } else if (!helpTriggerElement) {
      helpTriggerElement = document.activeElement as HTMLElement | null;
    }

    modal.style.display = 'flex';
    modal.classList.add('open');

    if (modal instanceof HTMLDialogElement && !modal.open) {
      try {
        modal.showModal();
      } catch {
        modal.setAttribute('open', '');
      }
    }

    document.addEventListener('keydown', handleModalKeyDown);

    const firstInput = (modal.querySelector('#report-course-id, #report-type, #report-description') as HTMLElement | null)
      || (modal.querySelector('input:not([type="hidden"]), select, textarea, button') as HTMLElement | null);
    firstInput?.focus();
  }

  function closeReportModal(): void {
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('open');

    if (modal instanceof HTMLDialogElement && modal.open) {
      try {
        modal.close();
      } catch {
        modal.removeAttribute('open');
      }
    }

    document.removeEventListener('keydown', handleModalKeyDown);
    if (helpTriggerElement && typeof helpTriggerElement.focus === 'function') {
      helpTriggerElement.focus();
    }
  }

  if (modal instanceof HTMLDialogElement) {
    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeReportModal();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeReportModal();
      }
    });
  }

  openBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      openReportModal(btn);
    });
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener('click', closeReportModal);
  });

  if (modal && (modal.classList.contains('open') || modal.hasAttribute('open') || modal.style.display === 'flex')) {
    if (modal instanceof HTMLDialogElement && !modal.open) {
      try {
        modal.showModal();
      } catch {
        modal.setAttribute('open', '');
      }
    }
    document.addEventListener('keydown', handleModalKeyDown);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending report…';
      }

      const reportCourseId = (document.getElementById('report-course-id') as HTMLInputElement)?.value || courseId || '';
      const type = (document.getElementById('report-type') as HTMLSelectElement)?.value || 'other';
      const description = (document.getElementById('report-description') as HTMLTextAreaElement)?.value || '';
      const courseVersionId = (document.getElementById('report-version-id') as HTMLInputElement)?.value || undefined;
      const stepId = (document.getElementById('report-step-id') as HTMLInputElement)?.value || undefined;
      const includeCodeConsent = (document.getElementById('report-include-code') as HTMLInputElement)?.checked || false;

      try {
        const res = await courseClient.submitReport({
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
          includeCodeConsent,
        });

        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          courseId: reportCourseId,
          isReportModalOpen: true,
          reportSuccessReference: res.reference,
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId, helpTriggerElement);
      } catch (err: any) {
        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
          includeCode: includeCodeConsent,
          isReportModalOpen: true,
          reportError: err.message || 'Failed to submit report. Please try again.',
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId, helpTriggerElement);
        const descEl = document.getElementById('report-description') as HTMLTextAreaElement | null;
        descEl?.focus();
      }
    });
  }
}
