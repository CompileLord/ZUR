import test from 'node:test';
import { setupMcpE2eFixture } from './helpers/mcp-adversarial-and-e2e/fixture.ts';
import { containmentAndAuthoringTests } from './helpers/mcp-adversarial-and-e2e/containment-and-authoring.ts';
import { accessControlAndPublishingTests } from './helpers/mcp-adversarial-and-e2e/access-control-and-publishing.ts';
import { hardeningAndRecoveryTests } from './helpers/mcp-adversarial-and-e2e/hardening-and-recovery.ts';

test('MCP End-to-End and Adversarial Verification (MCP-01 through MCP-12, T068)', async (t) => {
  const f = await setupMcpE2eFixture(t);
  await containmentAndAuthoringTests(t, f);
  await accessControlAndPublishingTests(t, f);
  await hardeningAndRecoveryTests(t, f);
});
