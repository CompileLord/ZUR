export function isInvalidResetLinkError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'VALIDATION_ERROR';
}

export function validateNewPassword(password: string): string | null {
  return password.length < 8 ? 'Password must be at least 8 characters.' : null;
}
