import { renderCourseRow } from '../../components/common/CourseRow.ts';
import { renderLoadingSkeleton, renderNoMatchesState } from '../../components/states/UniversalStates.ts';
import { renderIcon } from '../../components/common/icons.ts';

export interface CatalogCourseItem {
  id: string;
  title: string;
  description: string;
  categoryId?: string;
  categoryName?: string;
  difficulty?: string;
  language?: string;
  estimatedDurationMinutes?: number;
  authorName?: string;
  tags?: string[];
  currentVersionId?: string;
  versionNumber?: number;
}

export interface CatalogCategoryItem {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogPageProps {
  courses?: CatalogCourseItem[];
  categories?: CatalogCategoryItem[];
  languages?: string[];
  total?: number;
  isLoading?: boolean;
  error?: string | null;
  filters: {
    q?: string;
    category?: string;
    level?: string;
    language?: string;
    page?: number;
    limit?: number;
  };
  isMobileFilterOpen?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  nl: 'Dutch',
  ko: 'Korean',
  hi: 'Hindi',
};

function getLanguageDisplayName(code: string): string {
  const lower = code.toLowerCase();
  if (LANGUAGE_LABELS[lower]) {
    return LANGUAGE_LABELS[lower];
  }
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lower);
    if (name) return name;
  } catch {
    // ignore
  }
  return code.toUpperCase();
}

export function renderCatalogPage(props: CatalogPageProps): string {
  const {
    courses = [],
    categories = [],
    total = 0,
    isLoading = false,
    error = null,
    filters,
    isMobileFilterOpen = false,
  } = props;

  const page = Math.max(1, filters.page || 1);
  const limit = Math.max(1, filters.limit || 12);
  const totalPages = Math.ceil(total / limit) || 1;

  // Count active non-default filters
  let activeFilterCount = 0;
  if (filters.category) activeFilterCount++;
  if (filters.level) activeFilterCount++;
  if (filters.language) activeFilterCount++;

  const categoryOptions = categories
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat.id)}" ${filters.category === cat.id ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`
    )
    .join('');

  const rawLanguages = (props.languages && props.languages.length > 0)
    ? props.languages
    : courses.map((c) => c.language).filter((l): l is string => Boolean(l));

  const languageSet = new Set<string>();
  if (rawLanguages.length === 0 && !filters.language) {
    languageSet.add('en');
  }
  for (const l of rawLanguages) {
    if (l) languageSet.add(l);
  }
  if (filters.language) {
    languageSet.add(filters.language);
  }
  const sortedLanguages = Array.from(languageSet).sort((a, b) => {
    if (a.toLowerCase() === 'en') return -1;
    if (b.toLowerCase() === 'en') return 1;
    return getLanguageDisplayName(a).localeCompare(getLanguageDisplayName(b));
  });

  const languageOptions = sortedLanguages
    .map(
      (lang) =>
        `<option value="${escapeHtml(lang)}" ${filters.language === lang ? 'selected' : ''}>${escapeHtml(getLanguageDisplayName(lang))}</option>`
    )
    .join('');

  // Mobile Filter Sheet
  const mobileFilterSheet = `
    <div
      id="mobile-filter-sheet"
      class="mobile-filter-sheet ${isMobileFilterOpen ? 'open' : ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-filter-title"
      style="${isMobileFilterOpen ? 'display: flex;' : 'display: none;'}"
    >
      <div class="sheet-backdrop" data-action="close-sheet"></div>
      <div class="sheet-panel">
        <div class="sheet-header">
          <h2 id="mobile-filter-title" class="text-base font-semibold">Filter courses</h2>
          <button type="button" class="btn btn-ghost btn-compact" data-action="close-sheet" aria-label="Close filters">
            ✕
          </button>
        </div>
        <div class="sheet-body flex flex-col gap-4 py-4">
          <div class="form-group">
            <label for="mobile-filter-category" class="form-label">Category</label>
            <select id="mobile-filter-category" class="form-input">
              <option value="">All categories</option>
              ${categoryOptions}
            </select>
          </div>

          <div class="form-group">
            <label for="mobile-filter-level" class="form-label">Difficulty Level</label>
            <select id="mobile-filter-level" class="form-input">
              <option value="" ${!filters.level ? 'selected' : ''}>All levels</option>
              <option value="beginner" ${filters.level === 'beginner' ? 'selected' : ''}>Beginner</option>
              <option value="intermediate" ${filters.level === 'intermediate' ? 'selected' : ''}>Intermediate</option>
              <option value="advanced" ${filters.level === 'advanced' ? 'selected' : ''}>Advanced</option>
            </select>
          </div>

          <div class="form-group">
            <label for="mobile-filter-language" class="form-label">Content Language</label>
            <select id="mobile-filter-language" class="form-input">
              <option value="" ${!filters.language ? 'selected' : ''}>All languages</option>
              ${languageOptions}
            </select>
          </div>
        </div>
        <div class="sheet-footer flex gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary flex-1" data-action="clear-filters">Clear all</button>
          <button type="button" class="btn btn-primary flex-1" data-action="apply-mobile-filters">Apply filters</button>
        </div>
      </div>
    </div>
  `;

  // Main content depending on loading/error/courses state
  let content = '';

  if (isLoading) {
    content = `
      <div class="catalog-loading py-6" aria-busy="true">
        ${renderLoadingSkeleton('Loading courses')}
      </div>
    `;
  } else if (error) {
    content = `
      <div class="error-panel my-8 p-6 bg-danger-bg border border-danger rounded-lg" role="alert">
        <h2 class="text-base font-semibold text-danger mb-2">We couldn't load the course catalog</h2>
        <p class="text-sm text-secondary mb-4">${escapeHtml(error)}</p>
        <button type="button" class="btn btn-secondary btn-compact" data-action="retry">Retry</button>
      </div>
    `;
  } else if (courses.length === 0) {
    if (filters.q || filters.category || filters.level || filters.language) {
      content = renderNoMatchesState(
        escapeHtml(filters.q || 'selected filters'),
        '/courses'
      );
    } else {
      content = `
        <div class="empty-state py-16 text-center">
          <h2 class="text-lg font-semibold text-primary mb-2">No courses published yet</h2>
          <p class="text-sm text-secondary max-w-reading mx-auto">
            Courses will appear here when they are published.
          </p>
        </div>
      `;
    }
  } else {
    const courseRows = courses
      .map((c) => {
        const durationText = c.estimatedDurationMinutes
          ? `${c.estimatedDurationMinutes} mins`
          : undefined;

        const levelCapitalized = c.difficulty
          ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1)
          : undefined;

        return renderCourseRow({
          id: c.id,
          title: c.title,
          description: c.description,
          authorName: c.authorName,
          level: levelCapitalized,
          durationText,
          actionText: 'View course',
          actionHref: `/courses/${c.id}`,
        });
      })
      .join('');

    const paginationControls = `
      <nav class="catalog-pagination flex justify-between items-center mt-10 pt-6 border-t border-subtle" aria-label="Course list pagination">
        <button
          type="button"
          class="btn btn-secondary btn-compact"
          data-action="prev-page"
          ${page <= 1 ? 'disabled aria-disabled="true"' : ''}
        >
          Previous
        </button>
        <span class="text-sm text-secondary tabular-nums">
          Page ${page} of ${totalPages}
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-compact"
          data-action="next-page"
          ${page >= totalPages ? 'disabled aria-disabled="true"' : ''}
        >
          Next
        </button>
      </nav>
    `;

    content = `
      <div class="course-list flex flex-col gap-3 my-6" role="list">
        ${courseRows}
      </div>
      ${totalPages > 1 ? paginationControls : ''}
    `;
  }

  const resultsSummary = !isLoading && !error && courses.length > 0
    ? `<div class="catalog-results-count text-xs text-muted tabular-nums ml-auto" aria-live="polite">
        ${total} ${total === 1 ? 'course' : 'courses'} found
       </div>`
    : '';

  return `
    <div class="catalog-page container py-10" data-catalog-loaded="${!isLoading}">
      <div class="catalog-header mb-8">
        <h1 class="page-title font-semibold mb-2">Explore courses</h1>
      </div>

      <!-- Search and Filter Bar (P02) -->
      <section class="catalog-controls-section mb-6" aria-label="Search and filter options">
        <div class="search-bar mb-4">
          <form id="catalog-search-form" class="catalog-search-form flex items-center" role="search">
            <label for="catalog-search-input" class="sr-only">Search courses</label>
            <div class="search-input-wrapper relative w-full">
              <span class="search-input-icon" aria-hidden="true">
                ${renderIcon('search', { size: 16 })}
              </span>
              <input
                id="catalog-search-input"
                type="search"
                class="form-input w-full search-input"
                placeholder="Search courses"
                value="${filters.q ? escapeHtml(filters.q) : ''}"
                autocomplete="off"
              />
            </div>
          </form>
        </div>

        <div class="filter-toolbar flex items-center justify-between flex-wrap gap-3">
          <!-- Desktop Filter Dropdowns -->
          <div class="desktop-filters flex items-center gap-3 flex-wrap">
            <div class="filter-group">
              <label for="filter-category" class="sr-only">Category</label>
              <select id="filter-category" class="form-select form-input-compact">
                <option value="">All categories</option>
                ${categoryOptions}
              </select>
            </div>

            <div class="filter-group">
              <label for="filter-level" class="sr-only">Level</label>
              <select id="filter-level" class="form-select form-input-compact">
                <option value="" ${!filters.level ? 'selected' : ''}>All levels</option>
                <option value="beginner" ${filters.level === 'beginner' ? 'selected' : ''}>Beginner</option>
                <option value="intermediate" ${filters.level === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                <option value="advanced" ${filters.level === 'advanced' ? 'selected' : ''}>Advanced</option>
              </select>
            </div>

            <div class="filter-group">
              <label for="filter-language" class="sr-only">Language</label>
              <select id="filter-language" class="form-select form-input-compact">
                <option value="" ${!filters.language ? 'selected' : ''}>All languages</option>
                ${languageOptions}
              </select>
            </div>

            ${
              filters.q || filters.category || filters.level || filters.language
                ? `<button type="button" class="btn btn-ghost btn-compact text-xs text-muted" data-action="clear-filters">Clear filters</button>`
                : ''
            }
          </div>

          <!-- Mobile Filter Button -->
          <div class="mobile-filter-trigger">
            <button type="button" class="btn btn-secondary btn-compact flex items-center gap-2" data-action="open-sheet">
              <span>Filters</span>
              ${
                activeFilterCount > 0
                  ? `<span class="filter-count-badge text-xs px-1.5 py-0.5 rounded-full bg-accent text-on-accent font-semibold">${activeFilterCount}</span>`
                  : ''
              }
            </button>
          </div>

          ${resultsSummary}
        </div>
        ${(() => {
          const chips: string[] = [];
          if (filters.q) chips.push(`Query: "${escapeHtml(filters.q)}"`);
          if (filters.category) {
            const cat = categories.find((c) => c.id === filters.category);
            if (cat) chips.push(`Category: ${escapeHtml(cat.name)}`);
          }
          if (filters.level) chips.push(`Level: ${escapeHtml(filters.level.charAt(0).toUpperCase() + filters.level.slice(1))}`);
          if (filters.language) chips.push(`Language: ${escapeHtml(getLanguageDisplayName(filters.language))}`);
          if (chips.length === 0) return '';
          return `
            <div class="active-filter-chips flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-subtle" aria-label="Active filters">
              <span class="text-xs text-muted font-medium">${chips.length} active filter${chips.length === 1 ? '' : 's'}:</span>
              ${chips.map(chip => `<span class="filter-chip text-xs px-2 py-0.5 rounded bg-surface border border-subtle text-secondary font-medium">${chip}</span>`).join('')}
              <button type="button" class="btn btn-ghost btn-compact text-xs text-primary underline" data-action="clear-filters">Clear all</button>
            </div>
          `;
        })()}
      </section>

      <!-- Main Course List Area -->
      <section class="catalog-results" aria-label="Course catalog list">
        ${content}
      </section>

      ${mobileFilterSheet}
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
