# Implementation Plan — Rating & Comment Service

> Ecosystem: Taca Ecommerce Microservices Architecture
> Target Service: `rating-comment-service`

## 1. Roadmap & Milestones

| Milestone | Scope | Deliverables | Target Phase |
|---|---|---|---|
| **M0 — Audit & Discovery** | Workspace, inventory, cross-service matrix, risks, architecture | `docs/audit/*` | Completed |
| **M1 — Service Foundation** | Bootstrap, env, Mongo replica-set, error handling, request-id, logging, health, security guards, schemas, integration ports | Core infrastructure, base tests | Current Milestone |
| **M2 — Review Core & Eligibility** | Create/list/update/delete review flows, aggregate pipelines, order event projection, audit logging, transactions | Domain services, unit & integration tests | Next Milestone |
| **M3 — Seller Reply & Media Lifecycle** | Seller reply endpoints, shop scope checks, S3 adapter, presigned URLs, media scanner port, HEAD verification | Reply & Media modules, S3/MinIO tests | Milestone 3 |
| **M4 — Kafka & Outbox Relay** | Outbox publisher worker, retry backoff, DLQ router, order.delivered consumer, deduplication | Kafka integration, consumer tests | Milestone 4 |
| **M5 — End-to-End & Contract Verification** | Supertest E2E suites, contract tests with Catalog/Order schemas, docker-compose full stack test | Verified production-ready service | Milestone 5 |

## 2. Milestone 1 (Foundation) Implementation Details

### 2.1 Files to Create or Modify

| File | Action | Description |
|---|---|---|
| `package.json` | Review / Update | Verify scripts, ensure build, lint, test, test:e2e are configured |
| `src/main.ts` | Modify | NestJS bootstrap, global validation, exception filter, request ID middleware, shutdown hooks |
| `src/app.module.ts` | Modify | Wire all foundational modules (Config, Mongoose, Health, Security, Database) |
| `src/config/env.validation.ts` | Modify | Complete environment validation for DB, Kafka, S3, Port, Secrets |
| `src/database/database.module.ts` | Modify | Shared database module, replica-set health/readiness, session provider |
| `src/common/middleware/request-id.middleware.ts` | Verify | Request ID extraction and header injection |
| `src/common/filters/http-exception.filter.ts` | Verify | Standard error envelope `{ error: { code, message, details, trace_id } }` |
| `src/common/constants/review.constants.ts` | Verify | Business rule boundaries and limits |
| `src/common/enums/review-status.enum.ts` | Verify | Status enums for reviews, media, replies |
| `src/common/interfaces/api-response.interface.ts` | Verify | API response and error contracts |
| `src/common/utils/uuid.util.ts` | Verify | UUIDv7 generator |
| `src/security/context/actor-context.interface.ts` | Verify | ActorContext interface |
| `src/security/context/actor-context.decorator.ts` | Verify | `@Actor()` and `@OptionalActor()` parameter decorators |
| `src/security/guards/actor-context.guard.ts` | Create | Enforces trusted proxy secret and extracts actor |
| `src/security/guards/authenticated.guard.ts` | Create | Rejects unauthenticated requests |
| `src/security/guards/seller.guard.ts` | Create | Enforces seller role and shop scope |
| `src/security/security.module.ts` | Create | Exports security guards and context utilities |
| `src/review/schemas/review.schema.ts` | Modify | Add `deleted_at`, optimistic versioning, compound unique index |
| `src/review/schemas/review-media.schema.ts` | Create | Schema for review media metadata |
| `src/review/schemas/seller-reply.schema.ts` | Create | Schema for seller replies with unique review_id |
| `src/review/schemas/rating-aggregate.schema.ts` | Create | Schema for product rating summary |
| `src/review/schemas/review-audit.schema.ts` | Create | Schema for append-only audit events |
| `src/outbox/schemas/outbox-event.schema.ts` | Create | Schema for outbox pattern events |
| `src/eligibility/schemas/delivered-order-cache.schema.ts` | Create | Schema for delivered order projection |
| `src/integration/order/order-verification.port.ts` | Modify | Interface for order eligibility verification |
| `src/integration/product/product-metadata.port.ts` | Create | Interface for product & shop metadata resolution |
| `src/integration/media/media-storage.port.ts` | Create | Interface for S3/MinIO signed URLs and object verification |
| `src/integration/media/media-scanner.port.ts` | Create | Interface and dev adapter for media malware scanning |
| `src/integration/kafka/kafka-producer.port.ts` | Create | Interface for event dispatching |
| `docker-compose.yml` | Modify | Configure Mongo replica set `rs0` & replace deprecated Kafka image |
| `test/app.e2e-spec.ts` | Modify | Fix Supertest import syntax error |

### 2.2 Acceptance Criteria for Milestone 1

1. **Compilation**: `npm run build` exits with code 0 without any TypeScript errors.
2. **Environment Validation**: Starts cleanly with valid environment; throws explicit error if `MONGODB_URI` or `PORT` are invalid.
3. **Database Schemas**: All 7 Mongoose schemas registered with explicit unique indexes and schema options.
4. **Security Foundation**:
   - Non-public requests without trusted proxy secret rejected with 401.
   - Protected routes without `X-User-ID` rejected with 401 `REVIEW_UNAUTHENTICATED`.
   - Seller routes require `SELLER` or `SELLER_STAFF` role matching shop scope.
5. **Observability**:
   - `/health/live` returns `{ status: "ok" }`.
   - `/health/ready` returns readiness of MongoDB.
   - Global exception filter returns standard `{ error: { code, message, details, trace_id } }`.
6. **Tests**: All unit and e2e tests execute and pass cleanly.

## 3. Required Tests for Milestone 1

1. `env.validation.spec.ts`: Validates correct env parsing and catches missing required vars.
2. `actor-context.guard.spec.ts`:
   - Allows public routes.
   - Rejects untrusted direct access without proxy secret.
   - Parses valid actor context from headers.
   - Rejects missing actor on protected routes.
   - Rejects seller without proper shop scope.
3. `http-exception.filter.spec.ts`: Formats domain, validation, and database duplicate key errors into standard envelope.
4. `request-id.middleware.spec.ts`: Propagates existing `X-Request-ID` or generates valid UUIDv7.
5. `schema-indexes.spec.ts`: Verifies compound unique index on Review, unique index on SellerReply, and RatingAggregate schema structure.
6. `app.e2e-spec.ts`: Fixes import and tests `/health/live`.

## 4. Known Blockers & External Dependencies

| Dependency | Status | Mitigation / Strategy |
|---|---|---|
| Order Service REST endpoint | Unimplemented (Order Service only has docs) | Use event-driven `order.delivered` projection cache (`DeliveredOrderCache`). Missing events return `503 REVIEW_DEPENDENCY_UNAVAILABLE` rather than guessing REST contracts. |
| Media Scanner Service | Unimplemented | Define `MediaScannerPort` with dev adapter. Production fails-safe by keeping unscanned media in `SCANNING` status. |
| API Gateway | Unimplemented (Kong DB-less design) | Use `local-auth-proxy` convention (`ACTOR_CONTEXT_PROXY_SECRET` / `x-taca-local-proxy-secret`) for local development trust boundary. |
| Search / Product Catalog Consumers | Confirmed (`rating.events.v1`) | Match published contract `{ product_id, avg, count, distribution }` exactly. |
