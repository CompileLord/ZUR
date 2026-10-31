import test from 'node:test';
import { setupCatalogFixture } from './helpers/catalog-and-overview/fixture.ts';
import { catalogAndOverviewTests } from './helpers/catalog-and-overview/catalog-endpoints.ts';
import { reportIntakeTests } from './helpers/catalog-and-overview/report-intake.ts';
import { reportAuthorizationTests } from './helpers/catalog-and-overview/report-authorization.ts';

test('Course Catalog, Public Overview, and Reporting Endpoints (T069–T072)', async (t) => {
  const f = await setupCatalogFixture(t);
  await catalogAndOverviewTests(t, f);
  await reportIntakeTests(t, f);
  await reportAuthorizationTests(t, f);
});
