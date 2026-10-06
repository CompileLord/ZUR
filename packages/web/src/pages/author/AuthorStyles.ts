/**
 * Author workspace styles for continuous course builder, step editors,
 * tree navigation, collapsible inspector, and responsive layouts.
 */
export const authorStyles = `
/* Author Workspace Shell */
.shell-author {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-canvas, #0d1117);
  color: var(--text-primary, #e6edf3);
}

.author-header {
  height: 56px;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  background-color: var(--bg-surface, #161b22);
  border-bottom: 1px solid var(--border-subtle, #30363d);
  z-index: 20;
}

.author-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.author-header-left .back-link {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  text-decoration: none;
  white-space: nowrap;
  transition: color 120ms ease;
}

.author-header-left .back-link:hover {
  color: var(--text-primary, #e6edf3);
}

.author-header-left .header-divider {
  color: var(--border-default, #30363d);
  font-size: 0.875rem;
}

.author-course-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.author-tabs-bar {
  height: 44px;
  min-height: 44px;
  background-color: var(--bg-surface, #161b22);
  border-bottom: 1px solid var(--border-subtle, #30363d);
  display: flex;
  align-items: center;
  padding: 0 1.5rem;
  z-index: 10;
}

.author-tabs-bar .tabs-nav {
  display: flex;
  gap: 1.5rem;
  height: 100%;
}

.author-tabs-bar .tab-link {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 120ms ease, border-color 120ms ease;
}

.author-tabs-bar .tab-link:hover {
  color: var(--text-primary, #e6edf3);
}

.author-tabs-bar .tab-link.active {
  color: var(--accent, #d4f24c);
  border-bottom-color: var(--accent, #d4f24c);
}

/* Continuous 3-Pane Workspace Layout */
.author-workspace-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.author-workspace-main.full-pane {
  display: block;
  overflow-y: auto;
}

/* Persistent Course Tree Pane */
.author-tree-pane {
  width: 264px;
  min-width: 264px;
  max-width: 264px;
  background-color: var(--bg-surface, #161b22);
  border-right: 1px solid var(--border-subtle, #30363d);
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.author-tree-pane.collapsed {
  width: 0;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border-right: none;
}

.builder-tree-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle, #30363d);
}

.tree-title {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #8b949e);
  margin: 0;
}

.tree-root {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.tree-item {
  border-radius: var(--radius-sm, 6px);
  transition: background-color 120ms ease;
}

.tree-item.selected > .tree-node-content,
.tree-item.selected > .tree-node-header {
  background-color: var(--bg-hover, #21262d);
  border-left: 2px solid var(--accent, #d4f24c);
}

.tree-item.tree-course > a {
  display: block;
  padding: 0.375rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
  text-decoration: none;
  border-radius: var(--radius-sm, 6px);
}

.tree-module {
  margin-top: 0.25rem;
}

.tree-module > .tree-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.tree-module > .tree-node-header .tree-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-lesson {
  margin-left: 0.375rem;
}

.tree-lesson > .tree-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
}

.tree-lesson > .tree-node-header .tree-label {
  font-size: 0.8125rem;
  color: var(--text-secondary, #8b949e);
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}

.tree-lesson > .tree-node-header .tree-label strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-lesson > .tree-node-header .tree-label .step-count-label {
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: auto;
  font-size: 0.75rem;
}

.tree-step {
  margin-left: 0.5rem;
}

.tree-step .tree-node-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
}

.tree-step .tree-label {
  font-size: 0.8125rem;
  color: var(--text-secondary, #8b949e);
  text-decoration: none;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: 0.375rem;
}

.tree-step.selected .tree-label {
  color: var(--text-primary, #e6edf3);
  font-weight: 500;
}

.tree-step .tree-type-icon {
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary, #8b949e);
  flex-shrink: 0;
}

.tree-step.selected .tree-type-icon {
  color: var(--accent, #d4f24c);
}

.tree-node-actions {
  display: none;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.tree-node-content:hover .tree-node-actions,
.tree-node-content:focus-within .tree-node-actions {
  display: flex;
}

/* Editor Center Pane */
.author-editor-pane {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background-color: var(--bg-canvas, #0d1117);
}

/* Collapsible Inspector Pane */
.author-inspector-pane {
  width: 256px;
  min-width: 256px;
  max-width: 256px;
  background-color: var(--bg-surface, #161b22);
  border-left: 1px solid var(--border-subtle, #30363d);
  overflow-y: auto;
  padding: 1rem;
  flex-shrink: 0;
  transition: width 160ms cubic-bezier(0.16, 1, 0.3, 1), padding 160ms ease;
}

.author-inspector-pane.collapsed {
  width: 0;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border-left: none;
}

.inspector-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
  margin: 0 0 0.75rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle, #30363d);
}

/* Status Badges */
.status-badge-subtle {
  background-color: transparent !important;
  border: 1px solid currentColor;
  padding: 0.125rem 0.375rem;
}

/* Editor Header and Inputs */
.editor-header .step-title-input {
  font-size: 1.25rem;
  font-weight: 600;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background-color: var(--bg-surface, #161b22);
  border: 1px solid var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
  color: var(--text-primary, #e6edf3);
}

.editor-header .step-title-input:focus {
  border-color: var(--accent, #d4f24c);
  outline: none;
  box-shadow: 0 0 0 2px rgba(212, 242, 76, 0.2);
}

/* Theory Markdown Toolbar */
.markdown-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.375rem;
  background-color: var(--bg-surface, #161b22);
  border: 1px solid var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
}

.theory-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-subtle, #30363d);
  padding-bottom: 0.25rem;
}

.theory-tabs .tab-btn {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.theory-tabs .tab-btn.active {
  color: var(--text-primary, #e6edf3);
  border-bottom-color: var(--accent, #d4f24c);
}

/* Video Player Preview */
.video-preview-wrapper.responsive-embed {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  height: 0;
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
  background-color: #000;
}

.video-preview-wrapper.responsive-embed iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.video-preview-placeholder {
  padding: 2.5rem 1.5rem;
  text-align: center;
  background-color: var(--bg-surface, #161b22);
  border: 1px dashed var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
}

/* Quiz Option Rows */
.quiz-option-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  background-color: var(--bg-surface, #161b22);
  border: 1px solid var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
  transition: border-color 120ms ease;
}

.quiz-option-row:focus-within {
  border-color: var(--accent, #d4f24c);
}

/* Python Exercise Sub-Tabs */
.sub-tabs-bar {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-subtle, #30363d);
  margin-bottom: 1rem;
}

.sub-tab-btn {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.sub-tab-btn:hover {
  color: var(--text-primary, #e6edf3);
}

.sub-tab-btn.active {
  color: var(--text-primary, #e6edf3);
  border-bottom-color: var(--accent, #d4f24c);
}

/* Clean vs Dirty Save Button Hierarchy */
.shell-author:not(.is-dirty) .author-header-right > button.btn-primary {
  display: none;
}
.shell-author.is-dirty .author-header-right > button.btn-primary {
  display: inline-flex;
}

/* Student Preview Banner (High contrast light and dark modes) */
.shell-student-preview { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.shell-student-preview .shell-learning { flex: 1; height: auto; min-height: 0; }
.shell-student-preview .author-preview-banner { flex-shrink: 0; }

.author-preview-banner {
  background-color: var(--bg-surface, #161b22);
  border-bottom: 1px solid var(--border-subtle, #30363d);
  padding: 0.5rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: var(--text-primary, #e6edf3);
  position: relative;
  z-index: 50;
}

[data-theme="light"] .author-preview-banner {
  background-color: #ffffff;
  border-bottom: 1px solid #d0d7de;
  color: #1f2328;
}

.author-preview-banner .preview-tag {
  background-color: #d4f24c;
  color: #0d1117 !important;
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.05em;
  margin-right: 0.5rem;
  display: inline-block;
}

.author-preview-banner .preview-text {
  color: var(--text-secondary, #8b949e);
  font-size: 0.8125rem;
}

[data-theme="light"] .author-preview-banner .preview-text {
  color: #656d76;
}

/* Course Settings Jump Links */
.settings-jump-links {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--bg-surface, #161b22);
  border: 1px solid var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
  margin-bottom: 1.5rem;
  overflow-x: auto;
}

.settings-jump-link {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  text-decoration: none;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  white-space: nowrap;
  transition: color 120ms ease, background-color 120ms ease;
}

.settings-jump-link:hover {
  color: var(--text-primary, #e6edf3);
  background-color: var(--bg-hover, #21262d);
}

/* Publish Review Issue Groups */
.issue-exercise-group {
  margin-bottom: 1rem;
  background-color: var(--bg-surface, #161b22);
  border: 1px solid var(--border-subtle, #30363d);
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
}

.issue-exercise-header {
  padding: 0.625rem 0.875rem;
  background-color: var(--bg-hover, #21262d);
  border-bottom: 1px solid var(--border-subtle, #30363d);
  font-size: 0.8125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.issue-row.service-failure {
  border-left: 3px solid var(--danger, #f85149);
}

.issue-row.failed-assertion {
  border-left: 3px solid var(--warning, #d29922);
}

/* Reduced Motion Override */
@media (prefers-reduced-motion: reduce) {
  .author-tree-pane,
  .author-inspector-pane,
  .tab-link,
  .tree-item,
  .sub-tab-btn {
    transition: none !important;
  }
}
`;
