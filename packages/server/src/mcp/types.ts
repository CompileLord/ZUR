import type { TokenScope, StepType, CourseVisibility, EnrollmentPolicy, PublicationStatus } from 'zur-shared';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JsonRpcErrorObject;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: any;
}

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  CONFLICT: -32009,
  RATE_LIMITED: -32029,
  SCOPE_REQUIRED: -32030,
  REVISION_CONFLICT: -32049,
  VALIDATION_FAILED: -32050,
} as const;

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface McpToolInputProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: any;
  properties?: Record<string, any>;
  required?: string[];
  default?: any;
}

export interface McpToolInputSchema {
  type: 'object';
  properties: Record<string, McpToolInputProperty>;
  required?: string[];
}

export interface McpToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  annotations?: McpToolAnnotations;
  requiredScope?: TokenScope;
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export type BatchOperationType =
  | 'create_module'
  | 'update_module'
  | 'delete_module'
  | 'create_lesson'
  | 'update_lesson'
  | 'delete_lesson'
  | 'create_step'
  | 'update_step'
  | 'delete_step';

export interface BatchOperation {
  op: BatchOperationType;
  temp_id?: string;
  module_id?: string;
  lesson_id?: string;
  step_id?: string;
  title?: string;
  description?: string;
  position?: number;
  type?: StepType;
  is_required?: boolean;
  estimated_duration_minutes?: number;
  content?: any;
  test_cases?: Array<{
    stdin: string;
    expected_stdout: string;
    is_hidden?: boolean;
  }>;
}

export interface BatchReceipt {
  course_id: string;
  idempotency_key: string;
  prior_revision: number;
  new_revision: number;
  operations_applied: number;
  created_ids: Record<string, string>;
  affected_entities: string[];
  status: 'applied';
  created_at: string;
}
