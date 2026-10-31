import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpToolResult } from '../types.ts';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, MAX_INLINE_BASE64_BYTES } from './image-tool-shared.ts';

export async function handleCreateImageUpload(args: any, token: ValidatedMcpToken, db: DatabaseSync, authService: McpAuthService): Promise<McpToolResult> {
  const courseId = args?.course_id?.trim();
  const filename = args?.filename?.trim();
  const mimeType = (args?.mime_type || '').toLowerCase().trim();
  const fileSize = Number(args?.file_size);
  const checksum = args?.checksum?.trim()?.toLowerCase() || null;

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

  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`File size exceeds 10 MB limit (requested ${fileSize} bytes).`);
  }

  const uploadId = crypto.randomUUID();
  const rawUploadToken = crypto.randomBytes(32).toString('hex');
  const uploadTokenHash = crypto.createHash('sha256').update(rawUploadToken).digest('hex');
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  db.prepare(
    `INSERT INTO media_uploads (
      id, course_id, uploader_id, upload_token_hash, max_bytes, allowed_mime, expected_checksum, expires_at, status, uploaded_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`
  ).run(
    uploadId,
    courseId,
    token.authorId,
    uploadTokenHash,
    fileSize,
    mimeType,
    checksum,
    expiresAt,
    new Date().toISOString()
  );

  const result = {
    upload_id: uploadId,
    upload_url: `/api/author/courses/${courseId}/assets/upload-session/${uploadId}`,
    upload_token: rawUploadToken,
    max_bytes: MAX_UPLOAD_BYTES,
    allowed_mime: Array.from(ALLOWED_MIME_TYPES),
    expires_at: expiresAt,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleCompleteImageUpload(args: any, token: ValidatedMcpToken, db: DatabaseSync, authService: McpAuthService, mediaService: MediaService): Promise<McpToolResult> {
  const courseId = args?.course_id?.trim();
  if (!courseId) throw new ValidationError('course_id is required');

  authService.verifyMcpPermission(token, 'media:write', courseId);

  if (args?.expected_checksum && !args.checksum) args = { ...args, checksum: args.expected_checksum };
  let buffer: Buffer;
  let mimeType = args?.mime_type || 'image/png';
  let filename = args?.filename || 'image.png';

  if (args.base64_data) {
    buffer = Buffer.from(args.base64_data, 'base64');
    if (buffer.length > MAX_INLINE_BASE64_BYTES) {
      throw new ValidationError(
        `Inline base64 image exceeds 1 MiB decoded limit (received ${buffer.length} bytes). Use create_image_upload for larger images.`
      );
    }
    if (args.checksum) {
      const expectedChecksum = args.checksum.trim().toLowerCase();
      const actualChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
      if (expectedChecksum !== actualChecksum) {
        throw new ValidationError(`Image checksum mismatch. Expected ${expectedChecksum}, got ${actualChecksum}`);
      }
    }
  } else if (args.upload_id) {
    const upload = db.prepare('SELECT * FROM media_uploads WHERE id = ? AND course_id = ?').get(args.upload_id, courseId) as any;
    if (!upload) {
      throw new NotFoundError('Upload session not found.');
    }
    if (new Date(upload.expires_at) <= new Date()) {
      throw new ValidationError('Upload session has expired.');
    }

    if (upload.status !== 'uploaded' || !upload.staged_file_path || !fs.existsSync(upload.staged_file_path)) {
      throw new ValidationError('No bytes have been uploaded to this session yet.');
    }

    buffer = fs.readFileSync(upload.staged_file_path);
    if (buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty.');
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new ValidationError(`Image size exceeds 10 MB limit (received ${buffer.length} bytes).`);
    }

    mimeType = upload.allowed_mime;

    // Verify checksum
    const actualChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    if (upload.expected_checksum && upload.expected_checksum !== actualChecksum) {
      throw new ValidationError(`Uploaded bytes checksum does not match expected checksum.`);
    }
    if (args.checksum) {
      const reqChecksum = args.checksum.trim().toLowerCase();
      if (reqChecksum !== actualChecksum) {
        throw new ValidationError(`Uploaded bytes checksum does not match requested checksum.`);
      }
    }

  } else {
    throw new ValidationError('Either base64_data or upload_id must be provided.');
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

  authService.verifyMcpPermission(token, 'media:write', courseId);
  if (args.upload_id && !args.base64_data) {
    const upload = db.prepare('SELECT staged_file_path FROM media_uploads WHERE id = ? AND course_id = ? AND status = ?')
      .get(args.upload_id, courseId, 'uploaded') as { staged_file_path: string } | undefined;
    if (!upload) throw new ValidationError('Upload session is no longer available.');
    db.prepare("UPDATE media_uploads SET status = 'completed' WHERE id = ? AND status = 'uploaded'").run(args.upload_id);
    try { fs.unlinkSync(upload.staged_file_path); } catch { /* staged bytes can be removed by cleanup */ }
  }

  const markdownReference = `![${isDecorative ? '' : (altText || 'image')}](zur-asset:${asset.id})`;

  const result = {
    image_id: asset.id,
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
