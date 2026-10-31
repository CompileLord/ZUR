import test from 'node:test';
import { setupAuthorRedesignFixture } from './helpers/author-redesign/fixture.ts';
import { pageAcceptanceTests } from './helpers/author-redesign/page-acceptance.ts';
import { auditRequirementTests } from './helpers/author-redesign/audit-requirements.ts';

test('Author Interface Redesign Acceptance Suite (2026-10-06)', async (t) => {
  const f = await setupAuthorRedesignFixture(t);
  await pageAcceptanceTests(t, f);
  await auditRequirementTests(t, f);
});
