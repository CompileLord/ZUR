import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AuthenticationError, NotFoundError, ValidationError } from 'zur-shared';
import { ASSET_JSON_LIMIT } from '../body.ts';
import type { RouteContext } from './context.ts';

// Media assets: author upload, upload sessions, metadata and delivery.
export async function handleAssetRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, db, identityService, mediaService, parseJsonBody, sendJson } = rc;

  // 44. Author: Media Asset Upload & Listing (T033)
  const authorCourseAssetsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/assets$/);
  if (method === 'POST' && authorCourseAssetsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseAssetsMatch[1];
    const body = await parseJsonBody(req, ASSET_JSON_LIMIT);
    let buffer: Buffer;
    if (body.base64) {
      buffer = Buffer.from(body.base64, 'base64');
    } else {
      buffer = Buffer.from(body.data || '');
    }
    const asset = mediaService.uploadAsset(user.id, courseId, {
      buffer,
      filename: body.filename || 'image.png',
      mimeType: body.mimeType || 'image/png',
      altText: body.altText,
      isDecorative: body.isDecorative,
      caption: body.caption,
    });
    sendJson(res, 201, asset);
    return true;
  }
  if (method === 'GET' && authorCourseAssetsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseAssetsMatch[1];
    const assets = mediaService.listCourseAssets(user.id, courseId);
    sendJson(res, 200, { assets });
    return true;
  }

  // 44b. Author / MCP: Image Byte Upload Session Endpoint (PRD §23.5, Finding 2)
  const uploadSessionMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/assets\/upload-session\/([a-zA-Z0-9_-]+)$/);
  if ((method === 'PUT' || method === 'POST') && uploadSessionMatch) {
    const courseId = uploadSessionMatch[1];
    const uploadId = uploadSessionMatch[2];

    const uploadToken = req.headers['x-upload-token'];
    if (typeof uploadToken !== 'string' || !uploadToken) {
      throw new AuthenticationError('X-Upload-Token is required.');
    }
    if (req.headers.authorization) {
      throw new AuthenticationError('Author bearer credentials are not accepted by the upload endpoint.');
    }

    const uploadRow = db.prepare('SELECT * FROM media_uploads WHERE id = ? AND course_id = ?').get(uploadId, courseId) as any;
    if (!uploadRow) {
      throw new NotFoundError("This page isn't available.");
    }

    if (new Date(uploadRow.expires_at) <= new Date()) {
      throw new ValidationError('Upload session has expired.');
    }

    const providedHash = crypto.createHash('sha256').update(uploadToken).digest('hex');
    if (providedHash !== uploadRow.upload_token_hash) {
      throw new AuthenticationError('Invalid upload token.');
    }

    if (uploadRow.status !== 'pending') {
      throw new ValidationError('Upload capability has already been used.');
    }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== uploadRow.allowed_mime) {
      throw new ValidationError('Uploaded content type does not match the upload capability.');
    }

    const maxBytes = uploadRow.max_bytes || (10 * 1024 * 1024);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        throw new ValidationError(`Payload exceeds maximum upload size of ${maxBytes} bytes.`);
      }
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    if (fileBuffer.length === 0) {
      throw new ValidationError('Uploaded payload is empty.');
    }

    const uploadedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    if (uploadRow.expected_checksum && uploadRow.expected_checksum.toLowerCase() !== uploadedChecksum) {
      throw new ValidationError('Uploaded image checksum mismatch: bytes do not match expected checksum.');
    }

    let stagingDir = path.resolve('data/uploads/staged');
    let stagedPath = path.join(stagingDir, `${uploadId}.bin`);
    try {
      if (!fs.existsSync(stagingDir)) {
        fs.mkdirSync(stagingDir, { recursive: true });
      }
      fs.writeFileSync(stagedPath, fileBuffer, { flag: 'w' });
    } catch {
      stagingDir = path.join(os.tmpdir(), 'zur-uploads', 'staged');
      if (!fs.existsSync(stagingDir)) {
        fs.mkdirSync(stagingDir, { recursive: true });
      }
      stagedPath = path.join(stagingDir, `${uploadId}.bin`);
      fs.writeFileSync(stagedPath, fileBuffer, { flag: 'w' });
    }

    db.prepare(`
          UPDATE media_uploads
          SET staged_file_path = ?, uploaded_bytes = ?, uploaded_checksum = ?, status = 'uploaded'
          WHERE id = ? AND status = 'pending'
        `).run(stagedPath, fileBuffer.length, uploadedChecksum, uploadId);

    sendJson(res, 200, {
      status: 'uploaded',
      upload_id: uploadId,
      bytes_received: fileBuffer.length,
      checksum: uploadedChecksum,
    });
    return true;
  }

  // 45. Author: Update Media Asset Metadata (T033)
  const authorAssetItemMatch = pathname.match(/^\/api\/author\/assets\/([a-zA-Z0-9_-]+)$/);
  if (method === 'PUT' && authorAssetItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const assetId = authorAssetItemMatch[1];
    const body = await parseJsonBody(req);
    const updated = mediaService.updateAssetMetadata(user.id, assetId, body);
    sendJson(res, 200, updated);
    return true;
  }

  // 46. Public / Authorized Asset Delivery (T033)
  const assetServeMatch = pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && assetServeMatch) {
    const assetId = assetServeMatch[1];
    let userContext = { userId: null as string | null, capabilities: ['student'] as any, isSuspended: false };
    if (token) {
      try {
        const { user } = identityService.authenticateSession(token);
        userContext = {
          userId: user.id,
          capabilities: user.capabilities,
          isSuspended: user.accountStatus === 'suspended',
        };
      } catch {}
    }
    const file = mediaService.getAssetFile(assetId, userContext);
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Length': file.buffer.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(file.buffer);
    return true;
  }

  return false;
}
