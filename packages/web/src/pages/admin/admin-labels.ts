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
