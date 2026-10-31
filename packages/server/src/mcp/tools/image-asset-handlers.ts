import { DatabaseSync } from 'node:sqlite';
import { ValidationError, NotFoundError, AuthorizationError, StaleRevisionError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpToolResult } from '../types.ts';
import { imageMutationIdentity, saveImageMutation } from './image-tool-shared.ts';

export async function handleGetImage(args: any, token: ValidatedMcpToken, authService: McpAuthService, mediaService: MediaService): Promise<McpToolResult> {
  const assetId = (args?.asset_id || args?.image_id)?.trim();
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

export async function handleUpdateImage(args: any, token: ValidatedMcpToken, db: DatabaseSync, authService: McpAuthService, mediaService: MediaService): Promise<McpToolResult> {
  const assetId = (args?.asset_id || args?.image_id)?.trim();
  if (!assetId) throw new ValidationError('image_id or asset_id is required');

  const asset = mediaService.getAssetMetadata(assetId);
  authService.verifyMcpPermission(token, 'media:write', asset.courseId);
  if (args?.course_id && String(args.course_id).trim() !== asset.courseId) {
    throw new NotFoundError('Image asset not found in the supplied course.');
  }

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

export async function handleAttachImage(args: any, token: ValidatedMcpToken, db: DatabaseSync, authService: McpAuthService, mediaService: MediaService): Promise<McpToolResult> {
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

export async function handleDetachImage(args: any, token: ValidatedMcpToken, db: DatabaseSync, authService: McpAuthService): Promise<McpToolResult> {
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
