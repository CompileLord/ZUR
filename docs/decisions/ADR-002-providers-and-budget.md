# ADR-002: Architecture Selection, Provider Decisions, and Deployment Budget

- **Status**: Approved
- **Date**: 2026-09-24
- **Decision Owners**: Engineering Lead, Security Architect, Operations Lead
- **Relevant Specifications**: PRD_V2.md §§ 4, 13, 17, 18, 22, 23; tasks.json T003

---

## 1. Context and Problem Statement

ZUR requires explicit architectural decisions for its modular components:
1. Authentication & session lifecycle.
2. Transactional email delivery.
3. Approved third-party video providers.
4. Relational database store and migration engine.
5. Object storage for media assets.
6. Durable job queue and worker coordination.
7. Application runtime and deployment architecture.
8. Python runtime and execution isolation boundary.
9. Pilot capacity plan and infrastructure cost budget.

---

## 2. Architecture Decisions

### 2.1 Authentication & Session Management
- **Decision**: First-party session and token management using modern cryptographic primitives.
- **Implementation**:
  - Passwords hashed using `scrypt` / `argon2id` with high memory/time cost factors.
  - Sessions backed by 256-bit cryptographically secure random session tokens; stored as SHA-256 digests in the relational `sessions` table.
  - Verification tokens (email verification, password reset) expire in 7 days (email) and 1 hour (password reset), single-use, stored as SHA-256 hashes.
  - Session revocation: Individual session termination and `Sign out of all devices` (deletes all user sessions except current confirmation context).
  - Rate limiting: IP- and account-keyed exponential backoff on `/sign-in`, `/sign-up`, and `/forgot-password`.

### 2.2 Transactional Email Delivery
- **Provider**: AWS SES / Postmark (Production & Staging); Local in-memory / file-based SMTP mock for local development and integration testing.
- **Contract**: Transactional only (verification, password reset, invitation notifications). No marketing emails, no third-party tracking pixels. Copy-link fallback is provided in author UI if delivery fails.

### 2.3 Approved Video Embed Providers
- **Approved Providers**:
  - YouTube (`youtube-nocookie.com` embed URLs)
  - Vimeo (`player.vimeo.com` embed URLs)
- **Security & Privacy Enforcement**:
  - URL validation against strict regex allowlist.
  - Embed iframe attributes include `sandbox="allow-scripts allow-same-origin allow-presentation"` and `referrerpolicy="strict-origin-when-cross-origin"`.
  - Native video upload and transcoding is explicitly deferred to later scope (PRD §4).
  - Transcript or verified captions are mandatory for course publication (PRD §8.3, design §12 P23).

### 2.4 Relational Database & Migrations
- **Primary Relational Store**: PostgreSQL 16+ for Production and Staging.
- **Development & Test Store**: SQLite 3 with Write-Ahead Logging (WAL) and strict foreign key constraints enabled.
- **Migration Strategy**: Versioned pure SQL migrations (`001_initial_schema.sql`, etc.) executed via a lightweight, deterministic migration runner. Zero ORM magic; explicit indexes and foreign keys (`ON DELETE RESTRICT` for immutable history preservation).

### 2.5 Object Storage for Media Assets
- **Provider**: S3-compatible object storage (AWS S3 / Cloudflare R2) in production; local filesystem storage adapter (`data/media/`) in development.
- **Access Control**: Authoritative authorization check on every asset request. Uploads use bounded sessions (`media_uploads`) with checksum verification, content-type sniffing, 10 MB maximum size, and dimensions validation (PRD §11, §23.5). No SVG uploads in P0.

### 2.6 Durable Execution Queue
- **Architecture**: Transactional database-backed lease queue (`execution_jobs`) with worker lease acquisition, heartbeat, and automated lease recovery for local/staging/single-node; compatible with Redis/BullMQ for horizontal scaling.
- **Concurrency & Leases**: Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED` (Postgres) or atomic update transaction (SQLite). Leases expire after 60 seconds; abandoned jobs are automatically recovered or marked `INTERNAL_ERROR`.

### 2.7 Application Runtime & Deployment
- **Runtime**: Node.js v24 LTS with TypeScript.
- **Modular Packaging**:
  - `packages/shared`: Universal models, validation schemas, output comparator (§12.2), error definitions.
  - `packages/server`: Web/API server, authentication, domain services, MCP Streamable HTTP transport (`/mcp`).
  - `packages/worker`: Isolated job execution processor and queue manager.
  - `packages/web`: Frontend client with Vite, TypeScript, Vanilla CSS design tokens.

### 2.8 Python Runtime and Isolation Technology
- **Runtime Version**: Pinned Python 3.12 / 3.14 standard library environment.
- **Isolation Technology**:
  - Production: Linux container sandboxes with seccomp-bpf filters, dropped capabilities (`CAP_DROP=ALL`), network namespace isolation (`--network none`), read-only root filesystem, memory limit cgroup (128 MiB default, 256 MiB ceiling), CPU quota (2s default, 5s ceiling), and ephemeral tmpfs (16 MiB).
  - Development / Test: Subprocess boundary spawned with restricted environment, network denial, resource time/memory bounds via `child_process.spawn` and wrapper monitoring.
- **Safety Boundaries (PRD §13)**:
  - 64 KiB source code limit, 50 tests limit.
  - Child processes disabled.
  - Redaction of hidden tests: runner outputs are passed through strict redaction service before storage or transmission.

### 2.9 Pilot Capacity Plan & Infrastructure Budget

| Metric | Target / Budget |
|---|---|
| Concurrent Learners | 100 concurrent active users |
| Sustained Execution Rate | 20 execution requests / second for 5-minute peak |
| Web / API Nodes | 2x small compute nodes (2 vCPU, 4 GB RAM) |
| Worker Nodes | 4x worker instances (2 vCPU, 4 GB RAM) with auto-scaling to 8 |
| Database Tier | Managed Postgres (2 vCPU, 4 GB RAM, 50 GB NVMe SSD) |
| Object Storage | 50 GB storage budget for pilot media assets |
| Estimated Monthly Infrastructure Cost | $180 – $260 USD / month |

---

## 3. Compliance and Verification
- Satisfies `tasks.json` T003.
- Informs application configuration in T005 and data layer in T006.
