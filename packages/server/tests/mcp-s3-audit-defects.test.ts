import test from 'node:test';
import { setupS3AuditFixture } from './helpers/mcp-s3-audit-defects/fixture.ts';
import { officialSdkClientTests } from './helpers/mcp-s3-audit-defects/official-sdk-client.ts';
import { uploadAndChangePlanTests } from './helpers/mcp-s3-audit-defects/upload-and-change-plans.ts';
import { planSecurityAndIdempotencyTests } from './helpers/mcp-s3-audit-defects/plan-security-and-idempotency.ts';
import { imagesContentAndOriginTests } from './helpers/mcp-s3-audit-defects/images-content-and-origin.ts';

test('S3 Audit Defects Verification Suite (S3-01 through S3-10)', async (t) => {
  const f = await setupS3AuditFixture(t);
  await officialSdkClientTests(t, f);
  await uploadAndChangePlanTests(t, f);
  await planSecurityAndIdempotencyTests(t, f);
  await imagesContentAndOriginTests(t, f);
});
