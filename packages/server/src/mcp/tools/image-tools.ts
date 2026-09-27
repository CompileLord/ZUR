import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  StaleRevisionError,
  ConflictError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per PRD §11 & §23.5
const MAX_INLINE_BASE64_BYTES = 1024 * 1024; // 1 MiB decoded per PRD §23.5

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
          mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'], description: 'Image MIME type' },
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
      name: 'update_image',
      description: 'Updates alt text, decorative status, or caption of an existing image asset without altering ownership.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          expected_revision: { type: 'integer', description: 'Expected course draft revision' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Accessible alternative text' },
          is_decorative: { type: 'boolean', description: 'Decorative status' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['asset_id', 'expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'media:write',
    },
    {
      name: 'update_image_metadata',
      description: 'Alias for update_image: updates alt text, decorative status, or caption of an existing image asset.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          expected_revision: { type: 'integer', description: 'Expected course draft revision' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Accessible alternative text' },
          is_decorative: { type: 'boolean', description: 'Decorative status' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['asset_id', 'expected_revision', 'idempotency_key'],
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
          expected_revision: { type: 'integer', description: 'Expected draft_revision for conflict prevention' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
          alt_text: { type: 'string', description: 'Optional override alternative text' },
          caption: { type: 'string', description: 'Optional caption' },
        },
        required: ['course_id', 'step_id', 'asset_id', 'expected_revision', 'idempotency_key'],
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
          expected_revision: { type: 'integer', description: 'Expected draft_revision for conflict prevention' },
          idempotency_key: { type: 'string', description: 'Unique key for safe retries' },
        },
        required: ['course_id', 'step_id', 'asset_id', 'expected_revision', 'idempotency_key'],
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

    case 'complete_image_upload': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'media:write', courseId);

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

    case 'update_image':
    case 'update_image_metadata': {
      const assetId = (args?.asset_id || args?.image_id)?.trim();
      if (!assetId) throw new ValidationError('image_id or asset_id is required');

      const asset = mediaService.getAssetMetadata(assetId);
      authService.verifyMcpPermission(token, 'media:write', asset.courseId);

      const identity = imageMutationIdentity('update_image', args, token, db);
      if (identity.prior) return identity.prior;
      const expectedRevision = Number(args.expected_revision);

      db.exec('BEGIN IMMEDIATE');
      try {
        const course = db.prepare('SELECT draft_revision FROM courses WHERE id = ? AND owner_id = ?').get(asset.courseId, token.authorId) as any;
        if (!course) throw new NotFoundError("This page isn't available.");
        if (course.draft_revision !== expectedRevision) {
          throw new StaleRevisionError('Course revision conflict', course.draft_revision, { courseId: asset.courseId });
        }
        const newRevision = expectedRevision + 1;
        db.prepare('UPDATE courses SET draft_revision = ?, updated_at = ? WHERE id = ?').run(newRevision, new Date().toISOString(), asset.courseId);

        const updated = mediaService.updateAssetMetadata(token.authorId, assetId, {
          altText: args.alt_text,
          isDecorative: args.is_decorative,
          caption: args.caption,
        });

        const markdownReference = `![${updated.isDecorative ? '' : (updated.altText || 'image')}](zur-asset:${updated.id})`;

        const result = {
          image_id: updated.id,
          asset_id: updated.id,
          ...updated,
          alt_text: updated.altText,
          caption: updated.caption,
          is_decorative: updated.isDecorative,
          draft_revision: newRevision,
          new_revision: newRevision,
          markdown_reference: markdownReference,
        };

        const receipt = { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        saveImageMutation('update_image', asset.courseId, expectedRevision, receipt, token, db, identity);

        // Pre-commit authorization and revocation recheck immediately before COMMIT (PRD §23.3, §23.7)
        authService.verifyMcpPermission(token, 'media:write', asset.courseId);
        db.exec('COMMIT');
        return receipt;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    case 'attach_image': {
      const courseId = args?.course_id?.trim();
      const stepId = args?.step_id?.trim();
      const assetId = (args?.asset_id || args?.image_id)?.trim();

      if (!courseId) throw new ValidationError('course_id is required');
      if (!stepId) throw new ValidationError('step_id is required');
      if (!assetId) throw new ValidationError('image_id or asset_id is required');

      authService.verifyMcpPermission(token, 'media:write', courseId);
      authService.verifyMcpPermission(token, 'content:write', courseId);
      const identity = imageMutationIdentity('attach_image', args, token, db);
      if (identity.prior) return identity.prior;
      const expectedRevision = Number(args.expected_revision);

      db.exec('BEGIN IMMEDIATE');
      try {
        const course = db.prepare('SELECT draft_revision FROM courses WHERE id = ? AND owner_id = ?').get(courseId, token.authorId) as any;
        if (!course) throw new NotFoundError("This page isn't available.");

        if (course.draft_revision !== expectedRevision) {
          throw new StaleRevisionError(
            'Course revision conflict',
            course.draft_revision,
            { courseId, currentRevision: course.draft_revision }
          );
        }

        const asset = mediaService.getAssetMetadata(assetId);
        if (asset.courseId !== courseId) {
          throw new AuthorizationError('Asset does not belong to the specified course.');
        }
        if (asset.processingStatus !== 'ready') {
          throw new ValidationError('Asset is not ready for embedding.');
        }

        const step = db.prepare(`
          SELECT s.*, c.content_payload, c.revision as content_revision
          FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          LEFT JOIN step_contents c ON c.step_id = s.id
          WHERE s.id = ? AND m.course_id = ?
        `).get(stepId, courseId) as any;

        if (!step) {
          throw new NotFoundError('Step not found in the specified course.');
        }

        const altText = args?.alt_text !== undefined ? args.alt_text.trim() : (asset.altText || '');
        const markdownRef = asset.isDecorative ? `![](zur-asset:${asset.id})` : `![${altText || 'image'}](zur-asset:${asset.id})`;

        let payload: any = {};
        try {
          if (step.content_payload) payload = JSON.parse(step.content_payload);
        } catch {
          payload = {};
        }

        if (step.type === 'theory') {
          let md = payload.markdown || '';
          if (!md.includes(`zur-asset:${asset.id}`)) {
            md = md ? `${md.trimEnd()}\n\n${markdownRef}\n` : `# ${step.title}\n\n${markdownRef}\n`;
          }
          payload.markdown = md;
        } else if (step.type === 'python') {
          let ps = payload.problemStatement || '';
          if (!ps.includes(`zur-asset:${asset.id}`)) {
            ps = ps ? `${ps.trimEnd()}\n\n${markdownRef}\n` : `${markdownRef}\n`;
          }
          payload.problemStatement = ps;
        } else {
          throw new ValidationError(`Cannot attach image to step of type "${step.type}". Only theory and python steps support image embeds.`);
        }

        const now = new Date().toISOString();
        db.prepare(`
          UPDATE step_contents
          SET content_payload = ?, revision = revision + 1, updated_at = ?
          WHERE step_id = ?
        `).run(JSON.stringify(payload), now, stepId);

        db.prepare(`
          UPDATE media_assets
          SET reference_count = reference_count + 1, updated_at = ?
          WHERE id = ?
        `).run(now, assetId);

        const newCourseRevision = course.draft_revision + 1;
        db.prepare(`
          UPDATE courses
          SET draft_revision = ?, updated_at = ?
          WHERE id = ?
        `).run(newCourseRevision, now, courseId);

        const receipt: McpToolResult = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  step_id: stepId,
                  image_id: assetId,
                  asset_id: assetId,
                  markdown_reference: markdownRef,
                  attached: true,
                  draft_revision: newCourseRevision,
                  new_revision: newCourseRevision,
                },
                null,
                2
              ),
            },
          ],
        };
        saveImageMutation('attach_image', courseId, expectedRevision, receipt, token, db, identity);

        // Pre-commit authorization and revocation recheck immediately before COMMIT (PRD §23.3, §23.7)
        authService.verifyMcpPermission(token, 'media:write', courseId);
        authService.verifyMcpPermission(token, 'content:write', courseId);

        db.exec('COMMIT');
        return receipt;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    case 'detach_image': {
      const courseId = args?.course_id?.trim();
      const stepId = args?.step_id?.trim();
      const assetId = (args?.asset_id || args?.image_id)?.trim();

      if (!courseId) throw new ValidationError('course_id is required');
      if (!stepId) throw new ValidationError('step_id is required');
      if (!assetId) throw new ValidationError('image_id or asset_id is required');

      authService.verifyMcpPermission(token, 'media:write', courseId);
      authService.verifyMcpPermission(token, 'content:write', courseId);
      const identity = imageMutationIdentity('detach_image', args, token, db);
      if (identity.prior) return identity.prior;
      const expectedRevision = Number(args.expected_revision);

      db.exec('BEGIN IMMEDIATE');
      try {
        const course = db.prepare('SELECT draft_revision FROM courses WHERE id = ? AND owner_id = ?').get(courseId, token.authorId) as any;
        if (!course) throw new NotFoundError("This page isn't available.");

        if (course.draft_revision !== expectedRevision) {
          throw new StaleRevisionError(
            'Course revision conflict',
            course.draft_revision,
            { courseId, currentRevision: course.draft_revision }
          );
        }

        const step = db.prepare(`
          SELECT s.*, c.content_payload, c.revision as content_revision
          FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          LEFT JOIN step_contents c ON c.step_id = s.id
          WHERE s.id = ? AND m.course_id = ?
        `).get(stepId, courseId) as any;

        if (!step) {
          throw new NotFoundError('Step not found in the specified course.');
        }

        let payload: any = {};
        try {
          if (step.content_payload) payload = JSON.parse(step.content_payload);
        } catch {
          payload = {};
        }

        const assetRegex = new RegExp(`!\\[[^\\]]*\\]\\(zur-asset:${assetId}\\)`, 'g');

        if (step.type === 'theory' && payload.markdown) {
          payload.markdown = payload.markdown.replace(assetRegex, '').trim();
        } else if (step.type === 'python' && payload.problemStatement) {
          payload.problemStatement = payload.problemStatement.replace(assetRegex, '').trim();
        }

        const now = new Date().toISOString();
        db.prepare(`
          UPDATE step_contents
          SET content_payload = ?, revision = revision + 1, updated_at = ?
          WHERE step_id = ?
        `).run(JSON.stringify(payload), now, stepId);

        db.prepare(`
          UPDATE media_assets
          SET reference_count = MAX(0, reference_count - 1), updated_at = ?
          WHERE id = ?
        `).run(now, assetId);

        const newCourseRevision = course.draft_revision + 1;
        db.prepare(`
          UPDATE courses
          SET draft_revision = ?, updated_at = ?
          WHERE id = ?
        `).run(newCourseRevision, now, courseId);

        const receipt: McpToolResult = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  step_id: stepId,
                  image_id: assetId,
                  asset_id: assetId,
                  detached: true,
                  draft_revision: newCourseRevision,
                  new_revision: newCourseRevision,
                },
                null,
                2
              ),
            },
          ],
        };
        saveImageMutation('detach_image', courseId, expectedRevision, receipt, token, db, identity);

        // Pre-commit authorization and revocation recheck immediately before COMMIT (PRD §23.3, §23.7)
        authService.verifyMcpPermission(token, 'media:write', courseId);
        authService.verifyMcpPermission(token, 'content:write', courseId);

        db.exec('COMMIT');
        return receipt;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    default:
      throw new ValidationError(`Unsupported image tool: ${name}`);
  }
}

function imageMutationIdentity(name: string, args: any, token: ValidatedMcpToken, db: DatabaseSync): {
  key: string; digest: string; prior: McpToolResult | null;
} {
  const key = args?.idempotency_key?.trim();
  if (!key) throw new ValidationError('idempotency_key is required');
  const expected = Number(args?.expected_revision);
  if (!Number.isInteger(expected)) throw new ValidationError('expected_revision integer is required');
  const canonical = { ...args };
  delete canonical.idempotency_key;
  const digest = crypto.createHash('sha256').update(JSON.stringify({ name, canonical })).digest('hex');
  const row = db.prepare('SELECT request_digest, affected_entities FROM agent_mutations WHERE token_id = ? AND idempotency_key = ?')
    .get(token.id, key) as { request_digest: string; affected_entities: string } | undefined;
  if (row && row.request_digest !== digest) throw new ConflictError('Idempotency key has already been used with different request parameters.');
  return { key, digest, prior: row ? JSON.parse(row.affected_entities) as McpToolResult : null };
}

function saveImageMutation(name: string, courseId: string, baseRevision: number, result: McpToolResult,
  token: ValidatedMcpToken, db: DatabaseSync, identity: { key: string; digest: string }): void {
  db.prepare(`INSERT INTO agent_mutations
    (id, token_id, author_id, course_id, tool_name, idempotency_key, base_revision, new_revision,
     affected_entities, outcome, request_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`)
    .run(crypto.randomUUID(), token.id, token.authorId, courseId, name, identity.key, baseRevision,
      baseRevision + 1, JSON.stringify(result), identity.digest);
}
