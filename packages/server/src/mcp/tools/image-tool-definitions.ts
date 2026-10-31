import type { McpTool } from '../types.ts';

export function createImageTools(): McpTool[] {
  return [
    {
      name: 'create_image_upload',
      description: 'Requests a bounded upload session for an image asset (PNG, JPEG, or WebP up to 10 MB) returning an upload capability and token.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to bind image asset to' },
          filename: { type: 'string', description: 'Original file name' },
          mime_type: { type: 'string', description: 'Image MIME type: image/png, image/jpeg or image/webp' },
          file_size: { type: 'integer', description: 'File size in bytes (max 10485760)' },
          checksum: { type: 'string', description: 'Optional SHA-256 checksum of payload' },
        },
        required: ['course_id', 'filename', 'mime_type', 'file_size'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'complete_image_upload',
      description: 'Finalizes an image upload using uploaded session bytes or inline base64 (up to 1 MiB decoded), validating actual bytes, checksum, and dimensions, and returning a canonical zur-asset reference.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          upload_id: { type: 'string', description: 'Upload session ID from create_image_upload' },
          base64_data: { type: 'string', description: 'Inline base64-encoded image data (max 1 MiB decoded)' },
          filename: { type: 'string', description: 'Filename if uploading inline base64' },
          mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'], description: 'MIME type' },
          alt_text: { type: 'string', description: 'Alternative text describing the image for accessibility' },
          is_decorative: { type: 'boolean', description: 'Set true if image is purely decorative (alt text must then be empty)' },
          caption: { type: 'string', description: 'Optional image caption' },
          checksum: { type: 'string', description: 'Optional SHA-256 checksum for verification' },
          expected_checksum: { type: 'string', description: 'Alias of checksum' },
        },
        required: ['course_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'get_image',
      description: 'Retrieves metadata for an uploaded media asset.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Unique asset identifier' },
          image_id: { type: 'string', description: 'Alias of asset_id' },
        },
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
    {
      name: 'update_image',
      description: 'Updates alt text, decorative status, or caption of an existing image asset without altering ownership.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          image_id: { type: 'string', description: 'Alias of asset_id' },
          course_id: { type: 'string', description: 'Optional; when supplied it must match the asset\'s course' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected course draft revision' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Accessible alternative text' },
          is_decorative: { type: 'boolean', description: 'Decorative status' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'update_image_metadata',
      description: 'Deprecated alias of update_image (identical behaviour); prefer update_image.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          image_id: { type: 'string', description: 'Alias of asset_id' },
          course_id: { type: 'string', description: 'Optional; when supplied it must match the asset\'s course' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected course draft revision' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Accessible alternative text' },
          is_decorative: { type: 'boolean', description: 'Decorative status' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'attach_image',
      description: 'Adds a stable media asset reference to a draft step without modifying retained published snapshots.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID to attach the image to' },
          asset_id: { type: 'string', description: 'Media asset ID' },
          image_id: { type: 'string', description: 'Alias of asset_id' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision for conflict prevention' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Optional override alternative text' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['course_id', 'step_id', 'expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'detach_image',
      description: 'Removes a media asset reference from a draft step without deleting retained published assets.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID to detach the image from' },
          asset_id: { type: 'string', description: 'Media asset ID to remove' },
          image_id: { type: 'string', description: 'Alias of asset_id' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision for conflict prevention' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
        },
        required: ['course_id', 'step_id', 'expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
  ];
}
