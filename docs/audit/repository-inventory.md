# Repository Inventory — Rating & Comment Service

> Audited: 2026-11-08 | Auditor: Senior Backend Engineer (AI)
> Status: Foundation Milestone in progress (Scaffold upgraded to concrete Foundation)

## 1. Workspace Context

| Item | Value |
|---|---|
| Workspace root | `d:\PROJ_HDV` |
| Git | No git repository at workspace root; preserves all existing files |
| Target service | `rating-comment-service/` |
| Node.js engine | `>=22.0.0` |
| NestJS | `^11.0.11` |
| MongoDB | `^8.12.1` (Mongoose) |
| Kafka | `kafkajs ^2.2.4` |

## 2. Services in Workspace

| Directory | Technology | Status | Integration with Rating-Comment |
|---|---|---|---|
| `rating-comment-service/` | NestJS / MongoDB | Foundation milestone | Self |
| `api-gateway/` | Kong 3.x DB-less (design) | Docs only (no repo) | Routes `/api/v1/products/:id/reviews`, `/api/v1/reviews/**`, `/api/v1/seller/reviews/**` |
| `local-auth-proxy/` | Node.js / Express | Active code | Emulates API Gateway in local dev; validates JWT, strips client actor headers, injects `X-User-ID`, `X-User-Roles`, `X-User-Permissions`, `X-User-Shop-Scope`, and `x-taca-local-proxy-secret` |
| `Product-Catalog-Service/` | NestJS / MongoDB | Active code | Subscribes to `rating.events.v1` (`rating.aggregate.updated`) for rating summary projection; uses `ActorContextGuard` with `x-taca-local-proxy-secret` |
| `user-service/` | Java / Spring Boot | Active code | Core user & auth service; issues RS256 JWTs |
| `notification-service/` | Node.js | Active code | Consumes `notification.commands.v1` (`review-request-v1` template already seeded) |
| `cart-service/` | Java / Spring Boot | Active code | Cart management (split from Order-Commerce) |
| `payment-wallet-service/` | Node.js | Active code | Payments, refunds, seller payouts |
| `shipment-service/` | Java / Spring Boot | Active code | Shipping & carrier fulfillment |
| `web-service/` | React / Next.js | Active code | Frontend buyer/seller portal |

## 3. Rating-Comment Service Detailed File Inventory

### 3.1 Config & Infrastructure

| File | Status | Detailed Finding |
|---|---|---|
| `package.json` | ✅ Verified | Node `>=22.0.0`, NestJS 11, Mongoose 8.12.1, kafkajs 2.2.4, supertest 7.0.0, class-validator 0.14.1, class-transformer 0.5.1 |
| `package-lock.json` | ✅ Verified | Valid lockfile with all resolved dependencies (including `uuid`) |
| `nest-cli.json` | ✅ Verified | Standard NestJS 11 CLI config with tsconfigPaths enabled |
| `tsconfig.json` | ✅ Verified | ES2022 target, strictNullChecks, noImplicitAny, strictBindCallApply, esModuleInterop enabled |
| `tsconfig.build.json` | ✅ Verified | Excludes spec, test, dist |
| `Dockerfile` | ✅ Verified | Multi-stage Dockerfile (`node:22-alpine` build & runtime). Uses `npm ci`, compiles via `npm run build`, runs `dist/main.js` as unprivileged runtime. |
| `docker-compose.yml` | ⚠️ Inspected — Needs Fix | 1) Mongo configured as standalone `mongo:8.0` without replica set (multi-document transactions will fail). Needs `--replSet rs0` and replica set init.<br>2) Kafka uses deprecated image `bitnamilegacy/kafka:3.3.2-debian-11-r11`. Needs update to standard `bitnami/kafka:3.7` or KRaft compose. |
| `.env.example` | ✅ Verified | Complete configuration template with DB, Kafka, S3, logging, and security options |
| `.env` | ✅ Verified | Present in workspace root for local dev |
| `.gitignore` | ✅ Verified | Ignores `node_modules`, `dist`, `.env`, coverage |
| `.dockerignore` | ✅ Verified | Ignores `node_modules`, `dist`, `.git` |

### 3.2 Source Files (`src/`)

| File | Type | Status | Detailed Finding |
|---|---|---|---|
| `main.ts` | Bootstrap | ✅ Implemented | Global prefix `/api/v1` (excluding health), global validation pipe with whitelist & transformation, global ReviewExceptionFilter, RequestIdMiddleware, graceful shutdown hooks |
| `app.module.ts` | Root Module | ✅ Implemented | ConfigModule with env validation, MongooseModule with dynamic URI & autoIndex, modules registration |
| `config/env.validation.ts` | Config | ✅ Verified | Validates required `MONGODB_URI`, `PORT`, Kafka, S3, and business constraints |
| `common/constants/review.constants.ts` | Constants | ✅ Verified | `ratingMin: 1`, `ratingMax: 5`, `commentMaxLength: 5000`, `replyMaxLength: 2000`, `mediaMaxCount: 6`, `imageMaxSizeBytes: 10MiB`, `editWindowDays: 30`, `defaultPageSize: 20`, `maxPageSize: 100` |
| `common/enums/review-status.enum.ts` | Enums | ✅ Verified | `ReviewStatus` (PUBLISHED, DELETED, HIDDEN), `MediaStatus` (UPLOADING, SCANNING, READY, REJECTED, DELETED), `ReplyStatus` (PUBLISHED, DELETED) |
| `common/interfaces/api-response.interface.ts` | Interface | ✅ Verified | Standard `{ data, meta }` and error envelopes matching API contract |
| `common/utils/uuid.util.ts` | Utility | ✅ Verified | Generates UUIDv7 using `uuid` package |
| `common/middleware/request-id.middleware.ts` | Middleware | ✅ Verified | Extracts or generates `X-Request-ID`, validates length and charset, sets header on response |
| `common/filters/http-exception.filter.ts` | Filter | ✅ Verified | Translates `ReviewException`, Mongo 11000 duplicate key, and NestJS HttpExceptions into standard `{ error: { code, message, details, trace_id } }` |
| `database/database.module.ts` | DB Module | ⚠️ Needs Resolution | Currently empty stub. Can be configured to export shared Mongoose connection or manage connection lifecycle/health |
| `review/schemas/review.schema.ts` | Schema | ✅ Verified | UUIDv7 `_id`, unique compound index `(order_id, product_id, buyer_user_id)`, `deleted_at`, optimistic versioning, query indexes |
| `review/schemas/review-media.schema.ts` | Schema | ✅ Verified | Unique `object_key`, status, size_bytes, sha256 checksum, sort_order, deleted_at |
| `review/schemas/seller-reply.schema.ts` | Schema | ✅ Verified | Unique `review_id`, shop_id, seller_user_id, content ≤ 2000, versioning, timestamps |
| `review/schemas/rating-aggregate.schema.ts` | Schema | ✅ Verified | `_id=product_id`, avg (2 decimal precision), count, distribution `{1..5}`, source_version |
| `review/schemas/review-audit.schema.ts` | Schema | ✅ Verified | Target type/id, actor, action, redacted metadata, request_id, occurred_at |
| `outbox/schemas/outbox-event.schema.ts` | Schema | ✅ Verified | Topic, event_type, aggregate_type/id, payload, status (PENDING/PUBLISHED/FAILED/DLQ), retry_count, traceparent |
| `eligibility/schemas/delivered-order-cache.schema.ts` | Schema | ✅ Verified | Projected from `order.delivered` events: order_id, buyer_user_id, items (product_id, sku_id, shop_id), delivered_at |
| `security/context/actor-context.interface.ts` | Security | ✅ Verified | `userId`, `roles`, `permissions`, `shopScope` |
| `security/context/actor-context.decorator.ts` | Security | ✅ Verified | Custom parameter decorator `@Actor()` (throws 401 if missing) and `@OptionalActor()` |
| `security/guards/authenticated.guard.ts` | Guard | 🔄 To Implement | Enforces authenticated actor + validates trusted proxy boundary (proxy secret) |
| `security/guards/seller.guard.ts` | Guard | 🔄 To Implement | Enforces `SELLER` or `SELLER_STAFF` role + checks shop scope |
| `security/README.md` | Doc | ✅ Inspected | Documents proxy boundary and header spoofing defense |
| `integration/README.md` | Doc | ✅ Inspected | Documents integration contracts (Order, Catalog, Auth User, Kafka) |
| `observability/logging/README.md` | Doc | ✅ Inspected | Documents structured JSON stdout logging and PII redaction rules |
| `observability/logging/logger.ts` | Logger | ✅ Verified | Structured console logger |
| `observability/health/health.controller.ts` | Controller | ✅ Verified | Exposes `/health/live` (process) and `/health/ready` (Mongo/Kafka/S3 readiness) |
| `observability/health/health.service.ts` | Health Logic | ✅ Verified | Validates MongoDB connection and optional Kafka/S3 reachability |

### 3.3 Test Files

| File | Status | Notes |
|---|---|---|
| `src/aggregate/aggregate.service.spec.ts` | ✅ PASS | Unit tests for rating aggregate calculation (pure logic) |
| `test/app.e2e-spec.ts` | ⚠️ Needs Fix | Namespace import `import * as request from 'supertest'` causes TS2349. Needs `import request from 'supertest'` or `import supertest = require('supertest')`. |
| `test/jest-e2e.json` | ✅ Verified | Configured for `.e2e-spec.ts` |
