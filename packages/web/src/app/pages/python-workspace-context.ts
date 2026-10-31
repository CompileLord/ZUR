import type { ExecutionResult } from 'zur-shared';
import type { DraftSaveQueue } from '../../services/draft-save-queue.ts';
import type { PythonWorkspacePageOptions } from '../../pages/learning/PythonWorkspacePage.ts';

export interface PythonEditorInstance {
  editorView: any;
  setCode: (code: string) => void;
  setFontSize?: (size: number) => number;
  getFontSize?: () => number;
  destroy: () => void;
}

/** Shared mutable workspace state and helpers handed between the python workspace wiring modules. */
export interface PythonWorkspaceContext {
  initial: PythonWorkspacePageOptions;
  userId: string;
  requestedPath: string;
  code: string;
  currentResult: ExecutionResult | null;
  resultMode: PythonWorkspacePageOptions['resultMode'];
  activeTab: NonNullable<PythonWorkspacePageOptions['activeTab']>;
  customStdin: string;
  isRevisionConflict: boolean;
  editorInstance: PythonEditorInstance | null;
  textarea: HTMLTextAreaElement | null;
  saveQueue: DraftSaveQueue;
  pendingJobKey: string;
  runShortcutText: string;
  runAriaShortcut: string;
  getSelectedRunMode: () => 'samples' | 'custom';
  setSaveState: (status: NonNullable<PythonWorkspacePageOptions['saveStatus']>, text: string) => void;
  setDraftNotice: (text: string, canResolveConflict?: boolean) => void;
  setResults: (overrides?: Partial<PythonWorkspacePageOptions>) => void;
  selectTab: (tabName: 'results' | 'custom_input') => void;
  setEditorCode: (newCode: string) => void;
  setDrawerOpen: (open: boolean) => void;
  execute: (mode: 'samples' | 'custom' | 'submit', stdin?: string) => Promise<void>;
  waitForJob: (jobId: string) => Promise<{ result: ExecutionResult }>;
}
