# CI/CD plan

Pipeline (`.github/workflows/ci.yml`), all jobs parallel, npm cache, concurrency-cancelled per ref:

| Job | Gate |
|---|---|
| typecheck | `npm run typecheck` (shared, worker, server, web) |
| test | all `packages/*/tests/*.test.ts` except two suites that read untracked local screenshots (`audit-rules-s0`, `desktop-visual-evidence`) |
| build | `npm run build`, CSP inline-script hash check, uploads `web-dist` |
| audit | `npm audit --omit=dev --audit-level=high` |
| boot-smoke | production-mode server boot, `/readyz` + `/healthz`, clean SIGTERM |

No lint job: the repo has no lint tooling yet (follow-up: add ESLint, then a `lint` job).

Deploy (`deploy.yml`): manual `workflow_dispatch` with a ref, `production` environment with required reviewers, backup, release symlink switch, health check, automatic rollback to the previous release. Needs secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; hosts layout per `docs/DEPLOYMENT.md`. Untested until a host exists.

Branch protection (set in GitHub): require typecheck, test, build, audit, boot-smoke; require 1 review; block force-push.
Dependabot: weekly npm (grouped minor/patch), monthly actions.
