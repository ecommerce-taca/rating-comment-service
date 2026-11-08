# Taca Ecommerce — Rating & Comment Service

NestJS + TypeScript + MongoDB/Mongoose service for product reviews, seller replies, review media metadata and rating aggregates. This repository is an implementation scaffold based on the service design documents.

## Requirements

- Node.js 22+ and npm
- Docker Desktop / Docker Engine with Compose

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create local environment file
cp .env.example .env

# 3. Start local dependencies (MongoDB, Kafka, MinIO)
docker compose up -d

# 4. Start the service
npm run start:dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

- API base: `http://localhost:3000/api/v1`
- Liveness: `GET http://localhost:3000/health/live`
- Readiness: `GET http://localhost:3000/health/ready`
- MinIO console: `http://localhost:9001`

MongoDB is exposed on host port `27027` and Kafka on `29092` to reduce collision with common local services. The `.env.example` URI already uses `localhost:27027` for the provided Compose mapping.

## Project structure

```text
src/
├── main.ts
├── app.module.ts
├── common/                 # API envelope, errors, constants, request context
├── config/                 # Environment validation/configuration
├── database/               # Mongo connection and schema registration
├── review/                 # Buyer review endpoints/domain
├── eligibility/            # Delivered order/item verification boundary
├── aggregate/              # Product rating summary
├── reply/                  # Seller reply
├── media/                  # Signed upload and media metadata boundary
├── integration/            # External service/Kafka contracts
├── outbox/                 # Reliable event publishing foundation
├── security/               # Gateway actor context and authorization boundary
└── observability/          # Health and structured request telemetry
```

## Important implementation notes

- Client input must never determine `is_verified_purchase`; eligibility is server-derived.
- Review creation is allowed any time after the order is `DELIVERED`; there is no creation expiry. The 30-day policy applies to editing, measured from review creation per the DB/API docs.
- Unique review key: `(order_id, product_id, buyer_user_id)`.
- Review creation publishes immediately as `PUBLISHED`; no pre-moderation queue in V1.
- MongoDB transactions require a replica set or sharded cluster. The local Compose MongoDB is currently standalone; transaction-based write flows are intentionally not implemented until replica-set setup is enabled.
- Order verification fallback, media scanning provider, and Gateway trust configuration remain integration decisions. Do not trust raw identity headers from public clients; the service must only accept them behind the trusted Gateway/network boundary.
- Kafka and S3 are disabled in local app configuration until their adapters are implemented/configured.

## Commands

```bash
npm run build
npm test
npm run test:e2e
docker compose down
# Remove local data only when intended:
docker compose down -v
```

## Design documents

See `docs/lld/rating-comment.md`, `docs/db/rating-comment.md`, `docs/api/rating-comment.md`, and `docs/test/rating-comment.md`.
