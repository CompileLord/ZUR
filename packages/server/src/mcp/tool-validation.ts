import { ValidationError } from 'zur-shared';
import type { McpTool } from './types.ts';

/**
 * Central, schema-driven validation of MCP tool arguments.
 *
 * Supports the JSON-Schema subset used by the tool definitions: type
 * (string/integer/number/boolean/array/object), required, enum, minimum/maximum,
 * minLength/maxLength, minItems/maxItems, items, nested properties and
 * additionalProperties:false. Unknown keys are rejected with a "did you mean"
 * suggestion so that misnamed arguments (for example camelCase instead of
 * snake_case) are never silently ignored.
 */

type Schema = Record<string, any>;

/** Recursively mark fixed-shape objects (those that declare `properties`) as closed. */
export function closeObjectSchemas<T>(schema: T): T {
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as any;
  if (Array.isArray(s)) {
    for (const item of s) closeObjectSchemas(item);
    return schema;
  }
  if (s.type === 'object' && s.properties && typeof s.properties === 'object' && s.additionalProperties === undefined) {
    s.additionalProperties = false;
  }
  if (s.properties && typeof s.properties === 'object') {
    for (const key of Object.keys(s.properties)) closeObjectSchemas(s.properties[key]);
  }
  if (s.items) closeObjectSchemas(s.items);
  return schema;
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') {
    const shown = value.length > 30 ? `${value.slice(0, 30)}...` : value;
    return `string ${JSON.stringify(shown)}`;
  }
  return `${typeof value} ${JSON.stringify(value)}`;
}

function normalizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function suggestKey(unknown: string, valid: string[]): string | null {
  const target = normalizeKey(unknown);
  let best: { key: string; dist: number } | null = null;
  for (const key of valid) {
    const norm = normalizeKey(key);
    const dist = norm === target ? 0 : editDistance(target, norm);
    if (!best || dist < best.dist) best = { key, dist };
  }
  if (!best) return null;
  const threshold = Math.max(2, Math.floor(target.length / 3));
  return best.dist <= threshold ? best.key : null;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    default: return true;
  }
}

function validateValue(schema: Schema, value: unknown, path: string): void {
  if (schema.type && !typeMatches(schema.type, value)) {
    throw new ValidationError(`Invalid argument "${path}": expected ${schema.type}, received ${describeValue(value)}.`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new ValidationError(
      `Invalid argument "${path}": must be one of ${schema.enum.map((v: unknown) => JSON.stringify(v)).join(', ')} (received ${describeValue(value)}).`
    );
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new ValidationError(`Invalid argument "${path}": must be >= ${schema.minimum} (received ${value}).`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new ValidationError(`Invalid argument "${path}": must be <= ${schema.maximum} (received ${value}).`);
    }
  }
  if (typeof value === 'string') {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      throw new ValidationError(`Invalid argument "${path}": must be at most ${schema.maxLength} characters (received ${value.length}).`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new ValidationError(`Invalid argument "${path}": must be at least ${schema.minLength} characters.`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new ValidationError(`Invalid argument "${path}": must contain at most ${schema.maxItems} items (received ${value.length}).`);
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new ValidationError(`Invalid argument "${path}": must contain at least ${schema.minItems} items.`);
    }
    if (schema.items) {
      value.forEach((item, i) => validateValue(schema.items, item, `${path}[${i}]`));
    }
  }
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    validateObject(schema, value as Record<string, unknown>, path);
  }
}

function validateObject(schema: Schema, obj: Record<string, unknown>, path: string): void {
  const props: Record<string, Schema> = schema.properties || {};
  const prefix = path ? `${path}.` : '';

  if (schema.additionalProperties === false) {
    const valid = Object.keys(props);
    for (const key of Object.keys(obj)) {
      if (!(key in props)) {
        const suggestion = suggestKey(key, valid);
        throw new ValidationError(
          `Unknown argument "${prefix}${key}".` +
            (suggestion ? ` Did you mean "${prefix}${suggestion}"?` : '') +
            ` Valid keys${path ? ` for "${path}"` : ''}: ${valid.join(', ') || '(none)'}.`
        );
      }
    }
  }

  for (const req of schema.required || []) {
    if (obj[req] === undefined || obj[req] === null) {
      const reqType = props[req]?.type;
      const typeWord = reqType && reqType !== 'string' ? `${reqType} ` : '';
      throw new ValidationError(`${prefix}${req} ${typeWord}is required.`);
    }
  }

  for (const [key, propSchema] of Object.entries(props)) {
    const value = obj[key];
    if (value === undefined || value === null) continue; // absent optional values are ignored
    validateValue(propSchema, value, `${prefix}${key}`);
  }
}

export function validateToolArguments(tool: McpTool, args: unknown): void {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new ValidationError(`Invalid arguments for ${tool.name}: expected an object, received ${describeValue(args)}.`);
  }
  validateObject(tool.inputSchema as Schema, args as Record<string, unknown>, '');
}
