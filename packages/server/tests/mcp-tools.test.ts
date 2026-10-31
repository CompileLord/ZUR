import test from 'node:test';
import { setupMcpToolsFixture } from './helpers/mcp-tools/fixture.ts';
import { readsAndStructureTests } from './helpers/mcp-tools/reads-and-structure.ts';
import { imagesValidationAndAccessTests } from './helpers/mcp-tools/images-validation-and-access.ts';

test('MCP Authoring Tools Suite (T058–T064)', async (t) => {
  const f = await setupMcpToolsFixture(t);
  await readsAndStructureTests(t, f);
  await imagesValidationAndAccessTests(t, f);
});
