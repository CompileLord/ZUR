import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { MediaAsset } from 'zur-shared';
import { AuthorizationService } from './auth-service.ts';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface UploadAssetInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  altText?: string;
  isDecorative?: boolean;
  caption?: string;
}

export class MediaService {
  private db: DatabaseSync;
  private authService: AuthorizationService;
  private uploadDir: string;

  constructor(db: DatabaseSync, uploadDir: string = 'data/uploads') {
    this.db = db;
    this.authService = new AuthorizationService(db);
    this.uploadDir = uploadDir;
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private verifyCourseAuthor(userId: string, courseId: string): void {
    const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }
    if (course.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new AuthorizationError('You do not have permission to manage assets for this course');
      }
    }
  }

  private extractDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } {
    try {
      if (mimeType === 'image/png' && buffer.length >= 24) {
        // PNG header check
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        }
      } else if (mimeType === 'image/jpeg' && buffer.length > 4) {
        // JPEG header scan for SOF0 (0xFFC0) or SOF2 (0xFFC2)
        let offset = 2;
        while (offset < buffer.length - 8) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          if (marker === 0xc0 || marker === 0xc2) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
        }
      } else if (mimeType === 'image/webp' && buffer.length >= 30) {
        // Simple WebP VP8 / VP8X
        if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
          if (buffer.toString('ascii', 12, 16) === 'VP8X') {
            const width = 1 + buffer.readUIntLE(24, 3);
            const height = 1 + buffer.readUIntLE(27, 3);
            return { width, height };
          }
        }
      }
    } catch {
      // Fallback
    }
    return { width: 800, height: 600 };
  }

  uploadAsset(userId: string, courseId: string, input: UploadAssetInput): MediaAsset {
    this.verifyCourseAuthor(userId, courseId);

    if (!input.buffer || input.buffer.length === 0) {
      throw new ValidationError('File buffer is empty');
    }

    if (input.buffer.length > MAX_IMAGE_BYTES) {
      throw new ValidationError(`File size exceeds 5 MiB limit (received ${input.buffer.length} bytes)`);
    }

    const mime = (input.mimeType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new ValidationError(
        `Unsupported media type "${mime}". Only PNG, JPEG, and WebP images are allowed (SVG is not supported in P0).`
      );
    }

    const dimensions = this.extractDimensions(input.buffer, mime);
    const assetId = crypto.randomUUID();

    let ext = 'png';
    if (mime === 'image/jpeg') ext = 'jpg';
    if (mime === 'image/webp') ext = 'webp';

    const courseDir = path.join(this.uploadDir, courseId);
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }

    const filename = `${assetId}.${ext}`;
    const filePath = path.join(courseDir, filename);
    fs.writeFileSync(filePath, input.buffer);

    const isDecorative = Boolean(input.isDecorative);
    const altText = isDecorative ? '' : (input.altText || '').trim();
    const caption = (input.caption || '').trim();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO media_assets (
          id, course_id, uploader_id, file_path, file_size, mime_type,
          dimensions, alt_text, is_decorative, caption, processing_status,
          reference_count, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 'ready',
          0, ?, ?
        )`
      )
      .run(
        assetId,
        courseId,
        userId,
        filePath,
        input.buffer.length,
        mime,
        JSON.stringify(dimensions),
        altText || null,
        isDecorative ? 1 : 0,
        caption || null,
        now,
        now
      );

    return {
      id: assetId,
      courseId,
      uploaderId: userId,
      filePath,
      fileSize: input.buffer.length,
      mimeType: mime,
      dimensions,
      altText: altText || null,
      isDecorative,
      caption: caption || null,
      processingStatus: 'ready',
      referenceCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  getAssetMetadata(assetId: string): MediaAsset {
    const row = this.db.prepare('SELECT * FROM media_assets WHERE id = ?').get(assetId) as any;
    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    let dimensions = null;
    try {
      if (row.dimensions) dimensions = JSON.parse(row.dimensions);
    } catch {
      dimensions = null;
    }

    return {
      id: row.id,
      courseId: row.course_id,
      uploaderId: row.uploader_id,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      dimensions,
      altText: row.alt_text,
      isDecorative: Boolean(row.is_decorative),
      caption: row.caption,
      processingStatus: row.processing_status,
      referenceCount: row.reference_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getAssetFile(assetId: string, userContext: { userId?: string | null; capabilities: ('student' | 'author' | 'admin')[]; isSuspended: boolean }): { buffer: Buffer; mimeType: string } {
    const asset = this.getAssetMetadata(assetId);

    const canAccess = this.authService.canAccessAsset(userContext, assetId);
    if (!canAccess) {
      throw this.authService.safeNotFound();
    }

    if (!fs.existsSync(asset.filePath)) {
      throw this.authService.safeNotFound();
    }

    const buffer = fs.readFileSync(asset.filePath);
    return { buffer, mimeType: asset.mimeType };
  }

  getAdminPreviewFile(adminId: string, assetId: string): { buffer: Buffer; mimeType: string } {
    const actor=this.db.prepare('SELECT capabilities,account_status FROM users WHERE id=?').get(adminId) as any;
    const asset=this.db.prepare('SELECT file_path,mime_type,processing_status FROM media_assets WHERE id=?').get(assetId) as any;
    if(!actor || actor.account_status!=='active' || !JSON.parse(actor.capabilities||'[]').includes('admin') || !asset || asset.processing_status!=='ready' || !fs.existsSync(asset.file_path)) throw new NotFoundError("This page isn't available.");
    return {buffer:fs.readFileSync(asset.file_path),mimeType:asset.mime_type};
  }

  updateAssetMetadata(
    userId: string,
    assetId: string,
    metadata: { altText?: string; isDecorative?: boolean; caption?: string }
  ): MediaAsset {
    const asset = this.getAssetMetadata(assetId);
    this.verifyCourseAuthor(userId, asset.courseId);

    const isDecorative = metadata.isDecorative !== undefined ? metadata.isDecorative : asset.isDecorative;
    const altText = isDecorative ? '' : metadata.altText !== undefined ? metadata.altText.trim() : asset.altText;
    const caption = metadata.caption !== undefined ? metadata.caption.trim() : asset.caption;
    const now = new Date().toISOString();

    this.db
      .prepare(
        'UPDATE media_assets SET alt_text = ?, is_decorative = ?, caption = ?, updated_at = ? WHERE id = ?'
      )
      .run(altText || null, isDecorative ? 1 : 0, caption || null, now, assetId);

    return this.getAssetMetadata(assetId);
  }

  listCourseAssets(userId: string, courseId: string): MediaAsset[] {
    this.verifyCourseAuthor(userId, courseId);

    const rows = this.db
      .prepare('SELECT * FROM media_assets WHERE course_id = ? ORDER BY created_at DESC')
      .all(courseId) as any[];

    return rows.map((row) => {
      let dimensions = null;
      try {
        if (row.dimensions) dimensions = JSON.parse(row.dimensions);
      } catch {
        dimensions = null;
      }

      return {
        id: row.id,
        courseId: row.course_id,
        uploaderId: row.uploader_id,
        filePath: row.file_path,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        dimensions,
        altText: row.alt_text,
        isDecorative: Boolean(row.is_decorative),
        caption: row.caption,
        processingStatus: row.processing_status,
        referenceCount: row.reference_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }
}
