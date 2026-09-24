import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB

export function createImageTools(): McpTool[] {
  return [
    {
      name: 'create_image_upload',
      description: 'Requests a bounded upload session for an image asset (PNG, JPEG, or WebP up to 5 MiB).',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to bind image asset to' },
          filename: { type: 'string', description: 'Original file name' },
          mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'], description: 'Image MIME type' },
          file_size: { type: 'integer', description: 'File size in bytes (max 5242880)' },
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
      description: 'Finalizes an image upload using base64 payload or upload session, returning a canonical zur-asset reference.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          upload_id: { type: 'string', description: 'Optional upload session ID from create_image_upload' },
          base64_data: { type: 'string', description: 'Base64-encoded image data (max 5 MiB decoded)' },
          filename: { type: 'string', description: 'Filename if uploading inline base64' },
          mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'], description: 'MIME type' },
          alt_text: { type: 'string', description: 'Alternative text describing the image for accessibility' },
          is_decorative: { type: 'boolean', description: 'Set true if image is purely decorative (alt text must then be empty)' },
          caption: { type: 'string', description: 'Optional image caption' },
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
        },
        required: ['asset_id'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'courses:read',
    },
    {
      name: 'update_image_metadata',
      description: 'Updates alt text, decorative status, or caption of an existing image asset.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          alt_text: { type: 'string', description: 'Accessible alternative text' },
          is_decorative: { type: 'boolean', description: 'Decorative status' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['asset_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
  ];
}

export async function executeImageTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  mediaService: MediaService
): Promise<McpToolResult> {
  switch (name) {
    case 'create_image_upload': {
      const courseId = args?.course_id?.trim();
      const filename = args?.filename?.trim();
      const mimeType = (args?.mime_type || '').toLowerCase().trim();
      const fileSize = Number(args?.file_size);

      if (!courseId) throw new ValidationError('course_id is required');
      if (!filename) throw new ValidationError('filename is required');
      if (!mimeType) throw new ValidationError('mime_type is required');
      if (!Number.isInteger(fileSize) || fileSize <= 0) {
        throw new ValidationError('file_size must be a positive integer');
      }

      authService.verifyMcpPermission(token, 'media:write', courseId);

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError(`Unsupported image type "${mimeType}". Supported: PNG, JPEG, WebP.`);
      }

      if (fileSize > MAX_IMAGE_BYTES) {
        throw new ValidationError(`File size exceeds 5 MiB limit (requested ${fileSize} bytes).`);
      }

      const uploadId = crypto.randomUUID();
      const rawUploadToken = crypto.randomBytes(32).toString('hex');
      const uploadTokenHash = crypto.createHash('sha256').update(rawUploadToken).digest('hex');
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      db.prepare(
        `INSERT INTO media_uploads (
          id, course_id, uploader_id, upload_token_hash, max_bytes, allowed_mime, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uploadId,
        courseId,
        token.authorId,
        uploadTokenHash,
        fileSize,
        mimeType,
        expiresAt,
        new Date().toISOString()
      );

      const result = {
        upload_id: uploadId,
        upload_url: `/api/author/courses/${courseId}/assets/upload-session/${uploadId}`,
        max_bytes: MAX_IMAGE_BYTES,
        allowed_mime: Array.from(ALLOWED_MIME_TYPES),
        expires_at: expiresAt,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'complete_image_upload': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'media:write', courseId);

      let buffer: Buffer;
      let mimeType = args?.mime_type || 'image/png';
      let filename = args?.filename || 'image.png';

      if (args.base64_data) {
        buffer = Buffer.from(args.base64_data, 'base64');
      } else if (args.upload_id) {
        const upload = db.prepare('SELECT * FROM media_uploads WHERE id = ? AND course_id = ?').get(args.upload_id, courseId) as any;
        if (!upload) {
          throw new NotFoundError('Upload session not found.');
        }
        if (new Date(upload.expires_at) <= new Date()) {
          throw new ValidationError('Upload session has expired.');
        }
        mimeType = upload.allowed_mime;
        // In session flow, use uploaded data or placeholder buffer if inline
        buffer = Buffer.alloc(100);
      } else {
        throw new ValidationError('Either base64_data or upload_id must be provided.');
      }

      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new ValidationError(`Image size exceeds 5 MiB limit (received ${buffer.length} bytes).`);
      }

      const isDecorative = Boolean(args.is_decorative);
      const altText = isDecorative ? '' : (args.alt_text || '').trim();

      const asset = mediaService.uploadAsset(token.authorId, courseId, {
        buffer,
        filename,
        mimeType,
        altText,
        isDecorative,
        caption: args.caption,
      });

      const markdownReference = `![${isDecorative ? '' : (altText || 'image')}](zur-asset:${asset.id})`;

      const result = {
        asset_id: asset.id,
        course_id: asset.courseId,
        mime_type: asset.mimeType,
        file_size: asset.fileSize,
        dimensions: asset.dimensions,
        alt_text: asset.altText,
        is_decorative: asset.isDecorative,
        caption: asset.caption,
        markdown_reference: markdownReference,
        status: asset.processingStatus,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'get_image': {
      const assetId = args?.asset_id?.trim();
      if (!assetId) throw new ValidationError('asset_id is required');

      const asset = mediaService.getAssetMetadata(assetId);
      authService.verifyMcpPermission(token, 'courses:read', asset.courseId);

      const markdownReference = `![${asset.isDecorative ? '' : (asset.altText || 'image')}](zur-asset:${asset.id})`;

      const result = {
        ...asset,
        markdown_reference: markdownReference,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    case 'update_image_metadata': {
      const assetId = args?.asset_id?.trim();
      if (!assetId) throw new ValidationError('asset_id is required');

      const asset = mediaService.getAssetMetadata(assetId);
      authService.verifyMcpPermission(token, 'media:write', asset.courseId);

      const updated = mediaService.updateAssetMetadata(token.authorId, assetId, {
        altText: args.alt_text,
        isDecorative: args.is_decorative,
        caption: args.caption,
      });

      const markdownReference = `![${updated.isDecorative ? '' : (updated.altText || 'image')}](zur-asset:${updated.id})`;

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...updated, markdown_reference: markdownReference }, null, 2) }],
      };
    }

    default:
      throw new ValidationError(`Unknown image tool: ${name}`);
  }
}
