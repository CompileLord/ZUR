import { humanizeEnum } from '../../utils/formatters.ts';

const ALERT_LABELS: Record<string, string> = {
  'execution.stale_running': 'Expired worker leases',
  'execution.queue_age': 'Execution queue delay',
  'auth.recent_failures': 'Authentication failures',
  'autosave.recent_failures': 'Autosave failures',
  'auth.authorization_denials': 'Authorization denials',
};

const ALERTS_SHOWN_AS_CARDS = new Set(['email.delivery_issues', 'execution.infrastructure_failures']);

export function isCardAlert(code: string): boolean {
  return ALERTS_SHOWN_AS_CARDS.has(code);
}

export function alertLabel(code: string): string {
  return ALERT_LABELS[code] || 'Operational alert';
}

const ACTION_LABELS: Record<string, string> = {
  'category:create': 'Category created',
  'category:rename': 'Category renamed',
  'category:remove': 'Category removed',
  'course:archive_for_deletion': 'Course archived for deletion',
  'course:suspend': 'Course suspended',
  'course:unsuspend': 'Course restored',
  'course:waive_step': 'Step waived',
  'enrollment.accepted': 'Enrollment accepted',
  'enrollment.reinstate': 'Enrollment reinstated',
  'enrollment.revoke': 'Enrollment revoked',
  'execution:disable_new': 'New runs paused',
  'execution:reactivate': 'Execution resumed',
  'media:delete': 'Media deleted',
  'media:preview': 'Media previewed',
  'privacy_request:deletion_blocked': 'Account deletion blocked',
  'privacy_request:export': 'Account export prepared',
  'privacy_request:purge': 'Account purged',
  'privacy_request:status': 'Privacy request updated',
  'report:status': 'Report status changed',
  'support:access_granted': 'Support access granted',
  'support:access_revoked': 'Support access revoked',
  'support:records_viewed': 'Support records viewed',
  'user:grant-author': 'Author access granted',
  'user:revoke-author': 'Author access revoked',
  'user:suspend': 'Account suspended',
  'user:restore': 'Account restored',
};

export function actionLabel(action?: string | null): string {
  if (!action) return '';
  return ACTION_LABELS[action] || humanizeEnum(action.replace(/[:.]/g, ' '));
}

export function stateLabel(value?: string | null): string {
  return humanizeEnum(value);
}
