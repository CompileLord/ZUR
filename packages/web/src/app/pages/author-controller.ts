import { renderAuthorWorkspaceShell } from '../../components/shells/index.ts';
import { renderContentTree, renderTextInput } from '../../components/common/index.ts';
import { type RouteContext } from '../context.ts';
import { loadS2Page } from '../navigation.ts';
import { renderAgentActivityRoute } from './author-activity-controller.ts';
import { loadPublishReview } from './author-publish-controller.ts';
import { renderRosterRoute, renderStudentDetailRoute, renderAnalyticsRoute } from './author-students-controller.ts';
import { appEl } from '../state.ts';

export function renderAuthorRoute(ctx: RouteContext): void {
  const { route, params, path } = ctx;
  if (['P22', 'P23', 'P24', 'P25', 'P31'].includes(route.pageId)) { void loadS2Page(route.pageId, params, path); return; }
  if (route.pageId === 'P27') {
    void loadPublishReview(params.courseId, path);
    return;
  }
  if (route.pageId === 'P28') { renderRosterRoute(ctx); return; }
  if (route.pageId === 'P29') { renderStudentDetailRoute(ctx); return; }
  if (route.pageId === 'P30') { renderAnalyticsRoute(ctx); return; }
  if (route.pageId === 'P45') { renderAgentActivityRoute(ctx); return; }

  appEl.innerHTML = renderAuthorWorkspaceShell({
    courseId: params.courseId || 'course-python-foundations',
    courseTitle: 'Python foundations',
    publicationState: 'published',
    hasUnpublishedChanges: false,
    saveStatusText: 'Saved',
    activeTab: 'content',
    treeContent: renderContentTree({
      courseTitle: 'Python foundations',
      modules: [
        {
          id: 'm1',
          title: 'Variables',
          lessons: [
            {
              id: 'l1',
              title: 'Naming and Values',
              steps: [
                { id: 's1', title: 'What is a variable?', type: 'theory' },
                { id: 's2', title: 'Variables in Memory', type: 'video' },
                { id: 's3', title: 'Variable assignment syntax', type: 'quiz' },
                { id: 's4', title: 'Echoing Numbers', type: 'python', isSelected: true },
              ],
            },
          ],
        },
      ],
    }),
    editorContent: `
          <div class="exercise-editor">
            <h2 class="text-xl font-semibold mb-4">Edit Python Exercise: Echoing Numbers</h2>
            <div class="tabs-nav mb-4">
              <button class="tab-link active" aria-selected="true">Problem</button>
              <button class="tab-link" aria-selected="false">Code</button>
              <button class="tab-link" aria-selected="false">Tests (2)</button>
              <button class="tab-link" aria-selected="false">Validation</button>
            </div>
            ${renderTextInput({ id: 'step-title', name: 'title', label: 'Exercise Title', value: 'Echoing Numbers' })}
          </div>
        `,
    inspectorContent: `
          <div class="p-4">
            <h3 class="font-semibold text-sm mb-3">Exercise Settings</h3>
            ${renderTextInput({ id: 'duration', name: 'duration', label: 'Estimated duration (minutes)', value: '10' })}
          </div>
        `,
  });
  return;
}
