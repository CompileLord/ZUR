export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EXECUTION_ERROR'
  | 'INFRASTRUCTURE_ERROR'
  | 'STALE_REVISION'
  | 'REVISION_CONFLICT'
  | 'SCOPE_REQUIRED';

export class ZURError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | null;

  constructor(code: ErrorCode, message: string, statusCode: number = 400, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ZURError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class ValidationError extends ZURError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ZURError {
  constructor(message: string = 'Authentication required') {
    super('UNAUTHENTICATED', message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ZURError {
  constructor(message: string = 'Access denied') {
    super('FORBIDDEN', message, 403);
    this.name = 'AuthorizationError';
  }
}

export class ForbiddenError extends AuthorizationError {
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ZURError {
  constructor(message: string = "This page isn't available.") {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ZURError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class StaleRevisionError extends ZURError {
  constructor(message: string, currentRevision: number, details?: Record<string, unknown>) {
    super('STALE_REVISION', message, 409, { currentRevision, ...details });
    this.name = 'StaleRevisionError';
  }
}

export class RateLimitError extends ZURError {
  public readonly retryAfterSeconds: number;

  constructor(message: string = 'Too many requests', retryAfterSeconds: number = 60) {
    super('RATE_LIMITED', message, 429, { retryAfterSeconds });
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InfrastructureError extends ZURError {
  constructor(message: string = 'A temporary service error occurred. Please try again.') {
    super('INFRASTRUCTURE_ERROR', message, 500);
    this.name = 'InfrastructureError';
  }
}

export class ServiceUnavailableError extends ZURError {
  constructor(message: string = 'Service temporarily unavailable') {
    super('INFRASTRUCTURE_ERROR', message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

export class ScopeRequiredError extends ZURError {
  constructor(requiredScope: string, message: string = `Missing required scope: ${requiredScope}`) {
    super('SCOPE_REQUIRED', message, 403, { requiredScope });
    this.name = 'ScopeRequiredError';
  }
}


