# Cross-Service Contract Matrix — Rating & Comment Service

> Audited: 2026-11-08 | Evidence sources: docs/order-docs, docs/api-gateway-docs, docs/rating-comment-docs, CONTRACT-MATRIX.md

## 1. Kafka Topics — Outgoing

| Integration | Rating Expectation | Actual Contract | Compatibility | Required Action |
|---|---|---|---|---|
| `rating.events.v1` → Product Catalog | `review.created/updated/deleted`, `rating.aggregate.updated`, `review.reply_updated` | CONTRACT-MATRIX §3: `rating.aggregate.updated` consumer confirmed in Catalog ✅ and Search ✅ | ✅ Topic and event names confirmed | Implement per spec |
| `rating.aggregate.updated` payload | `{product_id, avg, count, distribution:{1..5}}` | CONTRACT-MATRIX §3 row: Catalog ✅, Search ✅, field names confirmed | ✅ | Emit exactly this shape |
| `notification.commands.v1` | `REVIEW_REQUESTED` command | CONTRACT-MATRIX §3: template `review-request-v1` already seeded in Notification ✅ | ✅ Template exists | Use NotificationCommandSchema format (auth-user pattern) |

## 2. Kafka Topics — Incoming

| Integration | Rating Expectation | Actual Contract | Compatibility | Required Action |
|---|---|---|---|---|
| `order.events.v1` / `order.delivered` | Buyer + items[] for eligibility | ORDER LLD §6.1 + §6.2: confirmed payload `{order_id, buyer:{user_id,email}, items:[{product_id,sku_id}], delivered_at}` | ✅ Exact payload confirmed | Consumer reads `payload.buyer.user_id`, `payload.items[].product_id/sku_id` |
| `product.events.v1` / `product.archived` | Product archived → update metadata | Catalog emits `product.archived` via Debezium envelope | ⚠️ Consumer must read `event_id` from Kafka header `id`, `aggregate_id` from key (C1 fix) | Apply C1 fix pattern |
| `catalog.events.v1` / `product.shop_snapshot_updated` | Shop name update | Confirmed from CONTRACT-MATRIX; `aggregate_id = shop_id` (C5 fix) | ✅ with C5 fix pattern | Consumer updates shop snapshot by shop_id |
| `user.events.v1` / `user.status_changed` | Account suspended → block mutations | Auth-user emits on `user.events.v1` | ✅ | Optional; cache suspended status |

## 3. Order Service Integration

| Question | Answer | Evidence |
|---|---|---|
| Does `order.delivered` exist? | ✅ Yes | ORDER LLD §6.1 |
| Exact topic | `order.events.v1` | ORDER LLD §6.1 |
| Exact envelope | `{event_id, schema_version:1, event_type:"order.delivered", occurred_at, aggregate_type:"ORDER", aggregate_id, payload:{order_id, buyer:{user_id,email}, items:[{product_id,sku_id}], delivered_at}}` | ORDER LLD §6.2 |
| `DELIVERED` is order-level? | Yes — `OrderStatus` enum includes `DELIVERED` | ORDER LLD §3.1, §5 |
| Event contains all order items? | Yes — `items[]` with all `{product_id, sku_id}` | ORDER LLD §6.2 |
| Single order multi-shop? | No — one order per shop (split at checkout) | ORDER LLD §1.1 |
| Buyer identification | `payload.buyer.user_id` (UUID) | ORDER LLD §6.2 |
| Internal REST API for verification? | Not specified — eligibility via event cache | ORDER LLD §4 open question #4 |
| Delivered event delayed/missed? | Use event-sourced cache; fallback = reject with `REVIEW_DEPENDENCY_UNAVAILABLE` | Design decision |

## 4. Gateway & Auth Integration

| Integration | Rating Expectation | Actual Contract | Compatibility | Required Action |
|---|---|---|---|---|
| `X-User-ID` | UUID from JWT `sub` | Gateway LLD §2.5: set by `taca-jwt` after strip | ✅ | Extract from header; never trust client-sent |
| `X-User-Roles` | Array of roles | Gateway LLD §2.5: `roles` JWT claim | ✅ Roles: `BUYER`, `SELLER`, `SELLER_STAFF`, `SUPER_ADMIN` etc | Parse comma/JSON-encoded array |
| `X-User-Permissions` | Permission claims | Gateway LLD §2.5: only admin users | ✅ | Optional for seller checks |
| `X-User-Shop-Scope` | Shop IDs seller owns | Gateway LLD §2.5: from JWT shop scope | ✅ | Use for seller shop ownership check |
| Header stripping | Gateway strips all client X-User-* | Gateway LLD §2.1.3: `taca-request-guard` runs first | ✅ CRITICAL | Service must ONLY trust these headers, never direct from client |
| Public routes | GET /products/:id/reviews is public | Gateway LLD §2.3: `GET /api/v1/products/{productId}/reviews` public | ✅ | No auth required for public listing |
| Seller route | POST/PATCH/DELETE /seller/reviews/:id/reply requires SELLER role | Gateway LLD §2.3: role-gated | ✅ | Check `X-User-Roles` contains SELLER or SELLER_STAFF |

## 5. Product Catalog & Search Integration

| Integration | Rating Expectation | Actual Contract | Compatibility | Required Action |
|---|---|---|---|---|
| `rating.aggregate.updated` consumer (Catalog) | Catalog caches rating summary | CONTRACT-MATRIX §3: ✅ | ✅ | Emit after every aggregate change |
| Payload field names | `{product_id, avg, count, distribution:{1,2,3,4,5}}` | Confirmed by CONTRACT-MATRIX §3 and rating LLD §6.3 | ✅ | Exact field names required |
| `rating.aggregate.updated` consumer (Search) | `rating_avg` field for `rating_desc` sort | CONTRACT-MATRIX §3: ✅ | ✅ | Search reads `avg` from payload |
| `product.archived` event | Hide reviews? No — keep history | LLD §6.2: "Review history vẫn giữ" | ✅ | Don't delete reviews on archive |
| `product.shop_snapshot_updated` | Update shop_name snapshot in reviews | LLD §6.2 | ✅ | Store minimal shop snapshot |

## 6. Notification Service Integration

| Integration | Rating Expectation | Actual Contract | Compatibility | Required Action |
|---|---|---|---|---|
| `REVIEW_REQUESTED` command | Optional notification to buyer | CONTRACT-MATRIX §3: template `review-request-v1` seeded ✅ | ✅ | Use NotificationCommandSchema |
| Command schema | Match `NotificationCommandSchema` | AUTH-USER pattern: `{event_id, schema_version, command_type, occurred_at, dedupe_key, user_id, channel, recipient, template, data}` | ✅ | Follow auth-user pattern exactly |

## 7. Kafka Envelope Convention

Per CONTRACT-MATRIX §8 (convention for unimplemented services):

```json
{
  "event_id": "uuid-v7",
  "event_type": "review.created",
  "schema_version": 1,
  "occurred_at": "ISO-8601 UTC",
  "aggregate_type": "REVIEW",
  "aggregate_id": "review-id",
  "payload": { ... },
  "traceparent": "W3C trace"
}
```

Kafka headers: `event_id`, `event_type`, `schema_version`, `aggregate_type`, `aggregate_id`

## 8. Environment Variable Convention

Per CONTRACT-MATRIX §8.6 (Node.js services):

| Var | Value |
|---|---|
| `KAFKA_BROKERS` | Comma-separated brokers |
| `KAFKA_CLIENT_ID` | `rating-comment-service` |
| `KAFKA_GROUP_ID` | Consumer group ID |
| DLQ | `rating-comment.events.dlq.v1` |
| Health | `/health/live` and `/health/ready` |

## 9. Edit Window Ambiguity — RESOLVED

**Question:** 30 days from creation or 30 days from delivery?

**Evidence from docs:**
- DB doc §7 item 3: "**Đã chốt**: edit 30 ngày sau tạo; tạo review không giới hạn thời gian"
- API doc §3.3: "edit window 30 ngày baseline"
- API doc §5 item 3: "edit 30 ngày, tạo review không giới hạn"

**Decision:** Edit window = 30 days from `created_at` of the review. Creation has NO time limit (only requires DELIVERED order).

**Implementation:** `editDeadline = review.created_at + 30 days`
