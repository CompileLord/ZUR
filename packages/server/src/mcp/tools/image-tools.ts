import { DatabaseSync } from 'node:sqlite';
import { ValidationError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { McpToolResult } from '../types.ts';
export { createImageTools } from './image-tool-definitions.ts';
import { handleCreateImageUpload, handleCompleteImageUpload } from './image-upload-handlers.ts';
import { handleGetImage, handleUpdateImage, handleAttachImage, handleDetachImage } from './image-asset-handlers.ts';

export async function executeImageTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  mediaService: MediaService
): Promise<McpToolResult> {
  switch (name) {
    case 'create_image_upload':
      return handleCreateImageUpload(args, token, db, authService);

    case 'complete_image_upload':
      return handleCompleteImageUpload(args, token, db, authService, mediaService);

    case 'get_image':
      return handleGetImage(args, token, authService, mediaService);

    case 'update_image':
    case 'update_image_metadata':
      return handleUpdateImage(args, token, db, authService, mediaService);

    case 'attach_image':
      return handleAttachImage(args, token, db, authService, mediaService);

    case 'detach_image':
      return handleDetachImage(args, token, db, authService);

    default:
      throw new ValidationError(`Unsupported image tool: ${name}`);
  }
}
