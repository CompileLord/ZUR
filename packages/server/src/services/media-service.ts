import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from 'zur-shared';
import type { MediaAsset } from 'zur-shared';
import { AuthorizationService } from './auth-service.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per PRD §11
const MAX_IMAGE_PIXELS = 25_000_000; // 25 megapixels per PRD §23.5
const MAX_IMAGE_DIMENSION = 10_000;
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
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
      const testFile = path.join(this.uploadDir, `.write-test-${process.pid}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
    } catch {
      const fallback = path.join(os.tmpdir(), 'zur-uploads');
      if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true });
      }
      this.uploadDir = fallback;
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

  private extractPngDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 24) throw new ValidationError('Invalid PNG header');
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    if (!isPng) throw new ValidationError('Invalid PNG signature');

    const chunkType = buffer.subarray(12, 16).toString('ascii');
    if (chunkType !== 'IHDR') throw new ValidationError('Missing PNG IHDR chunk');

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  private extractJpegDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      throw new ValidationError('Invalid JPEG signature');
    }
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset++;
      }
      if (offset >= buffer.length) break;
      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) {
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 7 > buffer.length) break;
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return { width, height };
      }
      offset += length;
    }
    throw new ValidationError('Invalid or corrupt JPEG: no SOF marker found');
  }

  private extractWebpDimensions(buffer: Buffer): { width: number; height: number } {
    if (buffer.length < 16) throw new ValidationError('Invalid WebP image');
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new ValidationError('Invalid WebP signature');
    }
    const chunkType = buffer.subarray(12, 16).toString('ascii');
    if (chunkType === 'VP8X') {
      if (buffer.length < 30) throw new ValidationError('Invalid VP8X WebP header');
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    } else if (chunkType === 'VP8 ') {
      if (buffer.length < 30) throw new ValidationError('Invalid VP8 WebP header');
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
      throw new ValidationError('Invalid VP8 keyframe');
    } else if (chunkType === 'VP8L') {
      if (buffer.length < 25) throw new ValidationError('Invalid VP8L WebP header');
      if (buffer[20] !== 0x2f) throw new ValidationError('Invalid VP8L signature');
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
    throw new ValidationError(`Unsupported WebP format: ${chunkType}`);
  }

  private validateAndExtractDimensions(
    buffer: Buffer,
    claimedMime: string
  ): { actualMime: string; dimensions: { width: number; height: number } } {
    const sample = buffer.subarray(0, 512).toString('latin1').toLowerCase();
    if (
      sample.includes('<svg') ||
      sample.includes('<?xml') ||
      sample.includes('<!doctype svg') ||
      sample.includes('<html')
    ) {
      throw new ValidationError('SVG uploads and HTML embeds are not permitted in P0.');
    }
    if (sample.startsWith('mz') || sample.startsWith('\x7felf') || sample.startsWith('#!/')) {
      throw new ValidationError('Executable files are not permitted.');
    }

    let actualMime: string;
    let dimensions: { width: number; height: number };

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      actualMime = 'image/png';
      dimensions = this.extractPngDimensions(buffer);
    } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      actualMime = 'image/jpeg';
      dimensions = this.extractJpegDimensions(buffer);
    } else if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      actualMime = 'image/webp';
      dimensions = this.extractWebpDimensions(buffer);
    } else {
      throw new ValidationError(
        'Invalid image: file bytes do not match supported image formats (PNG, JPEG, WebP).'
      );
    }

    if (claimedMime !== actualMime) {
      throw new ValidationError(
        `Claimed MIME type "${claimedMime}" does not match detected image type "${actualMime}".`
      );
    }

    if (dimensions.width <= 0 || dimensions.height <= 0) {
      throw new ValidationError('Invalid image dimensions: width and height must be positive.');
    }

    if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
      throw new ValidationError(
        `Image dimensions exceed maximum allowed limit of ${MAX_IMAGE_DIMENSION}px.`
      );
    }

    if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      throw new ValidationError(
        `Image exceeds maximum pixel budget of 25 megapixels (received ${dimensions.width}x${dimensions.height}).`
      );
    }

    // Parsing a header is insufficient: a truncated or corrupt image can still claim
    // plausible dimensions. Force the approved decoder to read pixel data under
    // bounded resources before the asset is stored or marked ready.
    const format = actualMime === 'image/png' ? 'png' : actualMime === 'image/jpeg' ? 'jpeg' : 'webp';
    const decoded = spawnSync('magick', [
      '-limit', 'memory', '128MiB', '-limit', 'map', '256MiB',
      '-limit', 'disk', '0', '-limit', 'time', '5',
      `${format}:-`, '-sample', '1x1', 'txt:-',
    ], { input: buffer, timeout: 7000, maxBuffer: 64 * 1024, encoding: 'utf8' });
    if (decoded.error || decoded.status !== 0 || !decoded.stdout?.includes('pixel enumeration')) {
      throw new ValidationError('Image could not be decoded safely. Upload a valid PNG, JPEG, or WebP image.');
    }

    return { actualMime, dimensions };
  }

  uploadAsset(userId: string, courseId: string, input: UploadAssetInput): MediaAsset {
    this.verifyCourseAuthor(userId, courseId);

    if (!input.buffer || input.buffer.length === 0) {
      throw new ValidationError('File buffer is empty');
    }

    if (input.buffer.length > MAX_IMAGE_BYTES) {
      throw new ValidationError(
        `File size exceeds 10 MB limit (received ${input.buffer.length} bytes)`
      );
    }

    const mime = (input.mimeType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new ValidationError(
        `Unsupported media type "${mime}". Only PNG, JPEG, and WebP images are allowed (SVG is not supported in P0).`
      );
    }

    const { actualMime, dimensions } = this.validateAndExtractDimensions(input.buffer, mime);
    const assetId = crypto.randomUUID();

    let ext = 'png';
    if (actualMime === 'image/jpeg') ext = 'jpg';
    if (actualMime === 'image/webp') ext = 'webp';

    let courseDir = path.join(this.uploadDir, courseId);
    const filename = `${assetId}.${ext}`;
    let filePath = path.join(courseDir, filename);
    try {
      if (!fs.existsSync(courseDir)) {
        fs.mkdirSync(courseDir, { recursive: true });
      }
      fs.writeFileSync(filePath, input.buffer);
    } catch {
      this.uploadDir = path.join(os.tmpdir(), 'zur-uploads');
      courseDir = path.join(this.uploadDir, courseId);
      if (!fs.existsSync(courseDir)) {
        fs.mkdirSync(courseDir, { recursive: true });
      }
      filePath = path.join(courseDir, filename);
      fs.writeFileSync(filePath, input.buffer);
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== input.buffer.length) {
      throw new ValidationError('Failed to write and verify uploaded image asset on disk.');
    }

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
        actualMime,
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
      mimeType: actualMime,
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
