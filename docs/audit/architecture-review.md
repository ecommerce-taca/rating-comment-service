# Architecture Review — Rating & Comment Service

> Audited: 2026-11-08 | Scope: Architecture, Security Boundaries, Concurrency & Data Consistency
> Ecosystem: Taca Ecommerce Microservices Architecture

## 1. Executive Summary & Current Architecture

The `rating-comment-service` manages buyer product reviews, verified purchase verification, seller replies, media attachments, and real-time rating aggregates within the Taca Ecommerce microservices ecosystem.

```text
[Client / Browser / Mobile App]
                │
                ▼ HTTPS
    [Kong API Gateway 3.x OSS / local-auth-proxy]
    - Strips client-supplied X-User-*, X-Auth-* headers
    - Validates JWT RS256 via JWKS from Auth User Service
    - Injects Actor Context: X-User-ID, X-User-Roles, X-User-Permissions, X-User-Shop-Scope
    - Injects Trust Token (ACTOR_CONTEXT_PROXY_SECRET)
                │
                ▼ Internal HTTP (Reverse Proxy)
    [Rating & Comment Service (NestJS 11)]
    ├─ Global Exception Filter & Request ID Middleware
    ├─ ActorContextGuard & Roles Guard
    ├─ Controllers (Public & Protected routes)
    ├─ Services & Domain Logic
    ├─ Multi-Document Transactions (Session-bound)
    ├─ MongoDB 8.x (Replica Set: ratingdb)
    │  ├─ reviews (UUIDv7 _id, unique: order_id + product_id + buyer_user_id)
    │  ├─ review_media (UUIDv7 _id, unique: object_key)
    │  ├─ seller_replies (UUIDv7 _id, unique: review_id)
    │  ├─ rating_aggregates (UUIDv7 _id = product_id)
    │  ├─ review_audits (append-only)
    │  ├─ delivered_order_cache (projected from order.delivered events)
    │  └─ outbox_events (transactionally committed with mutations)
    ├─ Outbox Publisher Worker (Background polling / relay)
    │  └─ Kafka Producer (Topic: rating.events.v1)
    └─ Kafka Consumer
       └─ Topic: order.events.v1 (order.delivered -> delivered_order_cache)
```

## 2. Recommended Module Boundaries & Dependency Graph

```text
AppModule
  ├── ConfigModule (Global, strict environment validation)
  ├── MongooseModule (MongoDB 8.x replica set, connection management)
  ├── HealthModule (HealthController: /health/live, /health/ready)
  ├── SecurityModule (Guards, Actor Context extraction, Proxy Secret verification)
  ├── EligibilityModule (Order delivered projection cache & verification port)
  ├── AggregateModule (Pure calculation & MongoDB aggregation pipelines)
  ├── OutboxModule (OutboxSchema, OutboxService, OutboxPublisherWorker)
  ├── KafkaModule (Consumer & Producer wrapper, error handling, DLT)
  ├── ReviewModule (ReviewController, ReviewService, ReviewSchema)
  ├── ReplyModule (ReplyController, ReplyService, SellerReplySchema)
  └── MediaModule (MediaController, MediaService, ReviewMediaSchema, S3Adapter, MediaScannerPort)
```

### Dependency Rules:
1. **No Circular Dependencies**: `ReviewModule` depends on `EligibilityModule`, `AggregateModule`, and `OutboxModule`. `EligibilityModule` does NOT depend on `ReviewModule`.
2. **Persistence Isolation**: Controllers never interact directly with Mongoose models; all queries, mutations, and transaction boundaries live in services.
3. **Integration Decoupling**: External calls (Kafka, S3, Order verification) are abstracted behind explicit interfaces/ports, allowing standalone unit testing and independent failure handling.

## 3. Database Architecture & Collections

### 3.1 Collections & Invariants

1. **`reviews`**:
   - `_id`: String (UUIDv7).
   - Compound Unique Index: `{ order_id: 1, product_id: 1, buyer_user_id: 1 }` (name: `uq_review_order_product_buyer`).
   - Query Indexes: `{ product_id: 1, status: 1, created_at: -1 }`, `{ shop_id: 1, status: 1, created_at: -1 }`, `{ buyer_user_id: 1, created_at: -1 }`.
   - Concurrency: `version` field (optimistic locking for edits and soft-deletes).
   - State: `status` enum (`PUBLISHED`, `DELETED`, `HIDDEN`). Soft delete sets `deleted_at`.

2. **`rating_aggregates`**:
   - `_id`: String (Product ID). Exactly one document per product.
   - Invariant: `count === distribution['1'] + distribution['2'] + distribution['3'] + distribution['4'] + distribution['5']`.
   - Invariant: `avg === count > 0 ? round((weighted_sum / count), 2) : 0`.
   - Incremental version: `source_version`.

3. **`seller_replies`**:
   - `_id`: String (UUIDv7).
   - Unique Index: `{ review_id: 1 }` (enforces exactly one reply per review).
   - Query Index: `{ shop_id: 1, updated_at: -1 }`.

4. **`review_media`**:
   - `_id`: String (UUIDv7).
   - Unique Index: `{ object_key: 1 }`.
   - Status: `UPLOADING` -> `SCANNING` -> `READY` (or `REJECTED`, `DELETED`).
   - Invariant: Maximum 6 media attachments in `READY` status per review.

5. **`review_audits`**:
   - Append-only collection.
   - PII Redaction: Strictly forbids logging raw review comment text, JWT tokens, S3 signed URLs, or customer contact info.

6. **`delivered_order_cache`**:
   - `_id`: String (`order_id`).
   - Index: `{ buyer_user_id: 1 }`.
   - Populated from `order.delivered` Kafka event.

7. **`outbox_events`**:
   - Status: `PENDING` -> `PUBLISHED` (or `FAILED` / `DLQ`).
   - Index: `{ status: 1, next_retry_at: 1, created_at: 1 }`.

## 4. Transaction Strategy

### 4.1 Boundary Design
Multi-document transactions are mandatory for state-changing operations to guarantee data integrity:

| Operation | Collections Updated in Single Transaction | Invariants Enforced |
|---|---|---|
| **Create Review** | `reviews` (insert) + `rating_aggregates` (recompute/upsert) + `review_audits` (insert) + `outbox_events` (insert) | Unique review per order/product/buyer; aggregate perfectly matches; outbox event only created if DB commits. |
| **Update Review** | `reviews` (optimistic update `version=version+1`) + `rating_aggregates` (recompute if rating changed) + `review_audits` (insert) + `outbox_events` (insert) | Version conflict prevention; rating update immediately reflected in aggregate. |
| **Delete Review** | `reviews` (soft-delete `status=DELETED`, `deleted_at=now`) + `rating_aggregates` (recompute decrements count) + `review_audits` (insert) + `outbox_events` (insert) | Review hidden from public; aggregate recomputed; audit trail preserved. |
| **Seller Reply** | `seller_replies` (insert/update) + `review_audits` (insert) + `outbox_events` (insert) | Only one reply; buyer rating untouched; shop ownership verified. |

### 4.2 Replica Set Requirement
- MongoDB multi-document transactions **require** a replica set (even single-node `rs0` in development). Standalone mongod instances throw `Transaction numbers are only allowed on a replica set member or mongos`.
- The `docker-compose.yml` must initialize MongoDB with `--replSet rs0` and run an initialization command (`rs.initiate()`).
- In environments without a replica set (e.g. basic unit tests), services should detect topology or gracefully mock the session.

## 5. Event-Driven Architecture (Outbox & Kafka)

### 5.1 Outbox Pattern
Direct publishing to Kafka within an HTTP request lifecycle is prohibited because it can cause dual-write anomalies (e.g., event sent but database transaction rolled back).
- Domain mutations write an `OutboxEvent` document in the same session.
- A background worker (`OutboxPublisherWorker`) polls pending events with exponential backoff and publishes to Kafka.
- Upon successful Kafka acknowledgment, the outbox record is marked `PUBLISHED`.
- On failure, `retry_count` is incremented. After 3 failed attempts, event routes to Dead Letter Queue (`rating-comment.events.dlq.v1`).

### 5.2 Outgoing Events (`rating.events.v1`)
- Topic: `rating.events.v1`
- Events:
  - `review.created`
  - `review.updated`
  - `review.deleted`
  - `rating.aggregate.updated` (consumed by Product Catalog for PDP summary and Search Service for `rating_desc` sorting)
  - `review.reply_updated`
- Kafka Key: `aggregate_id` (`product_id` for aggregates, `review_id` for reviews).
- Headers: `event_id`, `event_type`, `schema_version`, `aggregate_type`, `aggregate_id`.

### 5.3 Incoming Events & C1/C5 Conventions
- **`order.events.v1` (`order.delivered`)**: Populates `delivered_order_cache`.
- **C1 Convention**: Catalog Debezium connector places `event_id` in header `id` and `aggregate_id` in Kafka key. Rating-Comment consumers must parse both standard JSON envelope bodies and header fallbacks.
- **C5 Convention**: `product.shop_snapshot_updated` has `aggregate_id = shop_id`. Handlers must match on `shop_id` rather than assuming `product_id`.

## 6. Authentication Architecture & Trusted Actor Context

### 6.1 Threat Model & Boundary Analysis
- The Rating & Comment service operates as an internal microservice behind an API Gateway (Kong OSS in production; `local-auth-proxy` in local development).
- Client requests MUST NOT be allowed to directly supply `X-User-ID`, `X-User-Roles`, `X-User-Permissions`, or `X-User-Shop-Scope`.
- If an attacker reaches the service directly and spoofs `X-User-ID`, they could forge reviews or impersonate sellers.

### 6.2 Defensive Architecture:
1. **Trusted Proxy Secret**: Following the existing convention in `Product-Catalog-Service` and `local-auth-proxy`, the service checks for `ACTOR_CONTEXT_PROXY_SECRET` via header `x-taca-local-proxy-secret`. Direct requests lacking this secret are rejected with `401 Unauthorized`.
2. **Kong Gateway Ingress**: In production, Kong strips all client-supplied `X-User-*` headers, performs JWT verification, injects validated claims, and signs or forwards with internal secret or over an isolated Kubernetes network.
3. **Actor Context Extraction**:
   - `@Actor()` decorator extracts verified actor context.
   - `AuthenticatedGuard` verifies `userId` exists.
   - `SellerGuard` verifies actor has role `SELLER` or `SELLER_STAFF` and that their `shopScope` includes the product's `shop_id`.

## 7. External Service Integrations & Order Eligibility

### 7.1 Order Verification Strategy
- Business Rule: A review can only be created for an order item that is `DELIVERED`, owned by the buyer, and matches the product/SKU.
- Implementation: An asynchronous event-driven cache (`DeliveredOrderCache`) consumes `order.delivered` events from `order.events.v1`.
- Historical / Missed Events:
  - Because no synchronous Order REST endpoint exists, missing events return `503 REVIEW_DEPENDENCY_UNAVAILABLE` with clear diagnostic information, rather than inventing an unverified REST endpoint.
  - On service startup or new deployment, the Kafka consumer subscribes with `fromBeginning: true` using its consumer group, replaying historical delivered orders idempotently.

### 7.2 Media Storage & Scanner Port
- Upload flow: `POST /reviews/:id/media/upload-url` -> returns signed S3/MinIO upload URL -> client uploads bytes directly to storage -> client calls `POST /reviews/:id/media/complete`.
- Scanner Lifecycle: Media starts in `UPLOADING`, moves to `SCANNING` upon completion, and only reaches `READY` after passing `MediaScannerPort.scan()`.
- Development Implementation: `DevMediaScannerAdapter` marks media `READY` for local test convenience, but is strictly restricted by `NODE_ENV !== 'production'`. In production, media remains `SCANNING` until an approved scanning webhook/worker confirms safety.

## 8. Failure Handling & Scalability

1. **Idempotency**:
   - Unique Mongo index prevents concurrent duplicate reviews.
   - Delivered order event consumer uses `updateOne(..., { upsert: true })` by `order_id`.
   - Repeated deletes return `200` with current deleted state (idempotent soft-delete).
2. **Resilience**:
   - Kafka unavailable: Database transaction still succeeds; events remain in `outbox_events` and worker retries when Kafka recovers.
   - S3 unavailable: Reading reviews is completely unaffected; only media upload requests fail.
   - Unhandled exceptions: Global filter catches everything, logs sanitized error, and returns standard error envelope with `trace_id`.
3. **Zero PII Leakage**:
   - Public reviews only return masked buyer display names (`Nguyễn V. A` or `user***`).
   - No emails, phone numbers, or internal IDs exposed in public responses.
   - Raw review comments and tokens are excluded from logs.
