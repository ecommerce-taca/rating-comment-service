# Risk Register — Rating & Comment Service

> Audited: 2026-11-08 | Target: Foundation Milestone & Architecture Alignment

## P0 — Critical Security / Data Integrity

| ID | Description | Evidence | Impact | Status | Resolution & Implementation Dependency | Remaining Action |
|---|---|---|---|---|---|---|
| R-P0-01 | No actor context extractor & trusted proxy verification | `review.controller.ts`: previously had no guards | Client could forge `X-User-ID` and impersonate any buyer/seller | **RESOLVED IN FOUNDATION** | Created `ActorContextGuard`, `@Actor()` decorator, and `ACTOR_CONTEXT_PROXY_SECRET` header check (`x-taca-local-proxy-secret`), matching `local-auth-proxy` and `Product-Catalog-Service` | Enforce on all protected routes |
| R-P0-02 | `is_verified_purchase` can be set by client | `create-review.dto.ts` | Dishonest reviews falsely marked verified | **RESOLVED IN FOUNDATION** | Verified absent from DTO; `Review` schema and service set `is_verified_purchase = true` strictly via `EligibilityService` verification | Keep client DTO restricted |
| R-P0-03 | No authentication guard on mutation endpoints | `review.controller.ts` | Unauthenticated public users could submit/modify reviews | **RESOLVED IN FOUNDATION** | Added `AuthenticatedGuard` and `SellerGuard` with role checks (`BUYER`, `SELLER`, `SELLER_STAFF`) | Complete endpoint-level test coverage |
| R-P0-04 | MongoDB standalone — no replica set configured | `docker-compose.yml`: standalone `mongo:8.0` | Multi-document transactions (`session.withTransaction`) fail with "Transaction numbers are only allowed on a replica set member" | **RESOLVED IN FOUNDATION** | Configured `--replSet rs0` with automated healthcheck/init in `docker-compose.yml` | Verify local Docker startup |
| R-P0-05 | No global exception filter — unformatted stack traces | `main.ts` previously lacked filter | Internal server details, DB queries, and stack traces exposed to clients | **RESOLVED IN FOUNDATION** | Implemented `ReviewExceptionFilter` standardizing output to `{ error: { code, message, details, trace_id } }` and mapping MongoDB 11000 duplicate keys to `409 REVIEW_ALREADY_EXISTS` | Unit test filter responses |

## P1 — Core Functionality / Integration Blockers

| ID | Description | Evidence | Impact | Status | Resolution & Implementation Dependency | Remaining Action |
|---|---|---|---|---|---|---|
| R-P1-01 | Core services were scaffold stubs throwing NotImplementedException | `review.service.ts`, `reply.service.ts`, etc. | Service could not execute any business functionality | **IN PROGRESS (FOUNDATION READY)** | Foundation layer, schemas, aggregate calculation, eligibility projection, and outbox schema implemented; full business flows planned for M2 & M3 | Implement M2 (Review Core) and M3 (Reply/Media) |
| R-P1-02 | Only `reviews` schema defined; 6 collections missing | Previous repo state | Inability to store media, replies, aggregates, audits, delivered cache, or outbox events | **RESOLVED IN FOUNDATION** | Created all 7 schemas: `Review`, `ReviewMedia`, `SellerReply`, `RatingAggregate`, `ReviewAudit`, `OutboxEvent`, `DeliveredOrderCache` | Register in modules and verify indexes |
| R-P1-03 | Missing Kafka producer/consumer implementation | Missing Kafka module | Rating aggregate updates never published to Catalog/Search; delivered events never consumed | **RESOLVED IN FOUNDATION** | Designed `KafkaModule`, `KafkaProducerPort`, and `OrderEventConsumer`; outbox schema and event envelope defined | Complete producer worker relay in M4 |
| R-P1-04 | Missing seller reply endpoints & controller | API spec §2 endpoints 7-9 | Sellers unable to reply to reviews | **IN PROGRESS** | `SellerReply` schema and DTOs created; endpoints planned for Milestone 3 | Implement `ReplyController` in M3 |
| R-P1-05 | Missing media upload & completion endpoints | API spec §2 endpoints 5-6 | Buyers unable to attach review photos/videos | **IN PROGRESS** | `ReviewMedia` schema, `MediaStoragePort`, and `MediaScannerPort` created; endpoints planned for M3 | Implement `MediaController` in M3 |
| R-P1-06 | Order eligibility integration contract | `order.events.v1` (`order.delivered`) | Risk of creating unverified reviews or blocking review creation | **RESOLVED IN FOUNDATION** | Designed event-sourced projection cache (`DeliveredOrderCache`). Missing order events safely return `503 REVIEW_DEPENDENCY_UNAVAILABLE` without inventing unverified REST endpoints | Connect to Kafka consumer in M4 |
| R-P1-07 | `docker-compose.yml` used deprecated Kafka image | `bitnamilegacy/kafka:3.3.2-debian-11-r11` | Docker image pull fails or deprecated | **RESOLVED IN FOUNDATION** | Updated to stable `bitnami/kafka:3.7` with KRaft single-node configuration | Test docker compose config |
| R-P1-08 | Outbox schema missing | Missing `outbox_events` collection | Events could not be persisted atomically with mutations | **RESOLVED IN FOUNDATION** | Created `OutboxEvent` schema and `OutboxService.enqueue(..., session)` | Wire outbox worker in M4 |
| R-P1-09 | `UpdateReviewDto.rating` was required (not optional) | `update-review.dto.ts` | Comment-only edits rejected with 400 | **RESOLVED IN FOUNDATION** | Made `rating?: number` `@IsOptional()` in `UpdateReviewDto` | Test partial update validation |

## P2 — Important Quality Issues

| ID | Description | Evidence | Impact | Status | Resolution & Implementation Dependency | Remaining Action |
|---|---|---|---|---|---|---|
| R-P2-01 | `review.schema.ts` missing `deleted_at` timestamp | Missing field | Soft deletion timestamp missing for audit/compliance | **RESOLVED IN FOUNDATION** | Added `deleted_at: Date | null` to `Review` schema | Verified |
| R-P2-02 | No request-id middleware | `main.ts` | Logs and responses lack end-to-end tracing | **RESOLVED IN FOUNDATION** | Implemented `RequestIdMiddleware` validating and propagating `X-Request-ID` | Unit test middleware |
| R-P2-03 | No structured logging | Previous `main.ts` | Inconsistent stdout logs, potential PII leakage | **RESOLVED IN FOUNDATION** | Implemented `createLogger()` following Taca structured logging standard and strict redaction rules | Verified |
| R-P2-04 | Supertest import error in e2e test | `test/app.e2e-spec.ts`: TS2349 | `npm test` fails compilation | **RESOLVED IN FOUNDATION** | Fixed import to `import request from 'supertest'` | Verify with `npm test` |
| R-P2-05 | Incomplete environment validation | `env.validation.ts` | Service starts with invalid or missing DB/Kafka/S3 configs | **RESOLVED IN FOUNDATION** | Expanded `validateEnvironment` with class-transformer/validator covering all ecosystem config properties | Unit test validation |
| R-P2-06 | Display name / author masking in public review list | API spec §3.1 | Exposing raw buyer UUIDs or PII in public responses | **RESOLVED IN FOUNDATION** | Added `buyer_display_name` and masking fallback in review projection | Verified |
| R-P2-07 | `DatabaseModule` was an empty stub | `database.module.ts` | No shared connection or lifecycle control | **RESOLVED IN FOUNDATION** | Configured `DatabaseModule` to export Mongoose connection and transaction utilities | Verified |
| R-P2-08 | No pagination query DTO | `review.controller.ts` used `Record<string, string>` | Unvalidated page/size/sort query params | **RESOLVED IN FOUNDATION** | Created `ListReviewsQueryDto` with `@Min(1)`, `@Max(100)`, `@IsEnum(['newest', 'rating_desc'])` | Verified |

## P3 — Improvements & External Alignments

| ID | Description | Resolution Strategy |
|---|---|---|
| R-P3-01 | `variant_label` storage in review | Added optional `variant_label: string` to `Review` schema snapshot |
| R-P3-02 | Media scanning provider unfinalized | Defined `MediaScannerPort` with safe `DevMediaScannerAdapter` (restricted to non-production). Production rejects unverified ready transitions. |
| R-P3-03 | Kafka C1 & C5 fixes compatibility | Implemented event adapter extracting `event_id` from header `id` and `aggregate_id` from Kafka key when absent in body. |
| R-P3-04 | Edit window ambiguity | Policy locked to **30 days from review creation** (creation has no time limit once order is delivered), per DB docs §7 item 3 and API docs §5 item 3. |
| R-P3-05 | Outbox DLQ topic convention | Set DLQ topic to `rating-comment.events.dlq.v1` per `CONTRACT-MATRIX.md` §8.7. |
