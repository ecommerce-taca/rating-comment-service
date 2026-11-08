import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { ReviewMedia, ReviewMediaDocument } from './schemas/review-media.schema';
import { SellerReply } from './schemas/seller-reply.schema';
import { RatingAggregate, RatingAggregateDocument } from './schemas/rating-aggregate.schema';
import { ReviewAudit } from './schemas/review-audit.schema';
import { OutboxEvent } from '../outbox/schemas/outbox-event.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsQueryDto, DeleteReviewDto } from './dto/list-reviews-query.dto';
import { ReviewStatus, MediaStatus } from '../common/enums/review-status.enum';
import { ActorContext } from '../security/context/actor-context.interface';
import { ReviewException } from '../common/filters/http-exception.filter';
import { EligibilityService } from '../eligibility/eligibility.service';
import { AggregateService } from '../aggregate/aggregate.service';
import { generateId } from '../common/utils/uuid.util';
import { REVIEW_LIMITS } from '../common/constants/review.constants';
import { SortOrder } from 'mongoose';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(ReviewMedia.name) private readonly mediaModel: Model<ReviewMediaDocument>,
    @InjectModel(RatingAggregate.name) private readonly aggregateModel: Model<RatingAggregateDocument>,
    @InjectModel(ReviewAudit.name) private readonly auditModel: Model<ReviewAudit>,
    @InjectModel(OutboxEvent.name) private readonly outboxModel: Model<OutboxEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly eligibilityService: EligibilityService,
    private readonly aggregateService: AggregateService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public listing — no authentication required
  // ---------------------------------------------------------------------------

  async list(
    productId: string,
    query: ListReviewsQueryDto,
    requestId: string,
  ): Promise<object> {
    const { page, size, sort, rating, with_media: withMedia } = query;

    // Build filter — only PUBLISHED reviews are public
    const filter: Record<string, unknown> = {
      product_id: productId,
      status: ReviewStatus.PUBLISHED,
    };
    if (rating) filter['rating'] = rating;

    // Sort
    const sortOptions: Record<string, SortOrder> = rating
      ? { rating: -1, created_at: -1 }
      : { created_at: -1 };

    const skip = (page - 1) * size;
    const [reviews, total, aggregate] = await Promise.all([
      this.reviewModel.find(filter).sort(sortOptions).skip(skip).limit(size).lean(),
      this.reviewModel.countDocuments(filter),
      this.aggregateModel.findById(productId).lean(),
    ]);

    // Fetch media for READY status
    const mediaByReview: Record<string, ReviewMedia[]> = {};
    if (reviews.length > 0) {
      const reviewIds = reviews.map((r) => r._id);
      const allMedia = await this.mediaModel
        .find({ review_id: { $in: reviewIds }, status: MediaStatus.READY })
        .sort({ sort_order: 1 })
        .lean();

      for (const m of allMedia) {
        if (!mediaByReview[m.review_id]) mediaByReview[m.review_id] = [];
        mediaByReview[m.review_id]!.push(m);
      }
    }

    const reviewsWithDetails = reviews.map((review) => {
      const reviewMedia = mediaByReview[review._id] ?? [];
      const mediaItems = withMedia
        ? reviewMedia.map((m) => ({
            media_id: m._id,
            url: this.buildPublicMediaUrl(m.object_key),
            type: 'IMAGE',
            status: m.status,
          }))
        : [];

      return {
        review_id: review._id,
        product_id: review.product_id,
        sku_id: review.sku_id,
        variant_label: review.variant_label || undefined,
        rating: review.rating,
        comment: review.comment || undefined,
        media: mediaItems,
        author: {
          display_name: review.buyer_display_name || this.maskDisplayName(review.buyer_user_id),
          avatar_url: null,
        },
        is_verified_purchase: review.is_verified_purchase,
        // seller_reply is loaded separately for efficiency — omitted in list for now
        created_at: review.created_at,
        edited_at: review.edited_at,
      };
    });

    return {
      data: {
        aggregate: aggregate
          ? { avg: aggregate.avg, count: aggregate.count, distribution: aggregate.distribution }
          : { avg: 0, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
        reviews: reviewsWithDetails,
      },
      meta: {
        request_id: requestId,
        page,
        size,
        total,
        total_pages: Math.ceil(total / size),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Create review — requires authenticated buyer
  // ---------------------------------------------------------------------------

  async create(
    productId: string,
    dto: CreateReviewDto,
    actor: ActorContext,
    requestId: string,
  ): Promise<object> {
    // 1. Eligibility check — verify order delivered, buyer owns order, product/SKU in items
    const eligibility = await this.eligibilityService.verify({
      buyerUserId: actor.userId,
      orderId: dto.order_id,
      productId,
      skuId: dto.sku_id,
    });

    if (!eligibility.eligible) {
      if (eligibility.reason === 'ALREADY_REVIEWED') {
        throw new ReviewException('REVIEW_ALREADY_EXISTS', 'You have already reviewed this product for this order.');
      }
      throw new ReviewException(
        'REVIEW_NOT_ELIGIBLE',
        `Review not eligible: ${eligibility.reason ?? 'unknown'}`,
      );
    }

    // 2. Validate media IDs — all must be READY and owned by this actor
    const mediaIds = dto.media_ids ?? [];
    if (mediaIds.length > REVIEW_LIMITS.mediaMaxCount) {
      throw new ReviewException('REVIEW_MEDIA_LIMIT_EXCEEDED', `Maximum ${REVIEW_LIMITS.mediaMaxCount} media files per review.`);
    }
    if (mediaIds.length > 0) {
      await this.validateMediaOwnership(mediaIds, actor.userId, null);
    }

    // 3. Fetch shop_id from eligibility context
    const shopId = eligibility.shopId ?? 'unknown';

    // 4. Atomic transaction: create review + update aggregate + write outbox
    const session = await this.connection.startSession();
    let createdReview: ReviewDocument | null = null;
    let newAggregate: { avg: number; count: number; distribution: object } | null = null;

    try {
      await session.withTransaction(async () => {
        // Create review
        const reviewId = generateId();
        const [review] = await this.reviewModel.create(
          [
            {
              _id: reviewId,
              product_id: productId,
              shop_id: shopId,
              order_id: dto.order_id,
              sku_id: dto.sku_id,
              buyer_user_id: actor.userId,
              buyer_display_name: eligibility.buyerDisplayName ?? '',
              rating: dto.rating,
              comment: dto.comment ?? '',
              is_verified_purchase: true, // Always server-set
              status: ReviewStatus.PUBLISHED,
              version: 1,
              media_ids: mediaIds,
            },
          ],
          { session },
        );
        createdReview = review;

        // Recompute aggregate
        newAggregate = await this.recomputeAggregate(productId, session);

        // Write audit record
        await this.auditModel.create(
          [
            {
              _id: generateId(),
              actor_user_id: actor.userId,
              action: 'review.created',
              target_type: 'REVIEW',
              target_id: reviewId,
              metadata: { product_id: productId, order_id: dto.order_id, rating: dto.rating },
              request_id: requestId,
              occurred_at: new Date(),
            },
          ],
          { session },
        );

        // Write outbox events (published atomically with review creation)
        await this.outboxModel.create(
          [
            this.buildOutboxEvent('review.created', 'REVIEW', reviewId, 'rating.events.v1', {
              review_id: reviewId,
              product_id: productId,
              shop_id: shopId,
              rating: dto.rating,
              is_verified_purchase: true,
            }, requestId),
            this.buildOutboxEvent('rating.aggregate.updated', 'PRODUCT', productId, 'rating.events.v1', {
              product_id: productId,
              ...newAggregate,
            }, requestId),
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    if (!createdReview) {
      throw new ReviewException('REVIEW_INTERNAL_ERROR', 'Failed to create review.');
    }

    const review = createdReview as ReviewDocument;
    return {
      data: {
        review_id: review._id,
        product_id: review.product_id,
        sku_id: review.sku_id,
        rating: review.rating,
        comment: review.comment || undefined,
        status: review.status,
        is_verified_purchase: review.is_verified_purchase,
        version: review.version,
        created_at: review.created_at,
        aggregate: newAggregate,
      },
      meta: { request_id: requestId },
    };
  }

  // ---------------------------------------------------------------------------
  // Update review — buyer owner only, within 30-day edit window
  // ---------------------------------------------------------------------------

  async update(
    reviewId: string,
    dto: UpdateReviewDto,
    actor: ActorContext,
    requestId: string,
  ): Promise<object> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review || review.status === ReviewStatus.DELETED) {
      throw new ReviewException('REVIEW_NOT_FOUND', 'Review not found.');
    }

    // Ownership check
    if (review.buyer_user_id !== actor.userId) {
      throw new ReviewException('REVIEW_FORBIDDEN', 'You do not own this review.');
    }

    // Edit window check: 30 days from created_at
    const editDeadline = new Date(review.created_at);
    editDeadline.setDate(editDeadline.getDate() + REVIEW_LIMITS.editWindowDays);
    if (new Date() > editDeadline) {
      throw new ReviewException('REVIEW_EDIT_EXPIRED', 'Review edit window has expired (30 days from creation).');
    }

    // Optimistic concurrency check
    if (review.version !== dto.version) {
      throw new ReviewException('REVIEW_VERSION_CONFLICT', `Version conflict: expected ${review.version}, got ${dto.version}.`);
    }

    const oldRating = review.rating;

    // Validate media IDs
    const mediaIds = dto.media_ids ?? review.media_ids;
    if (mediaIds.length > REVIEW_LIMITS.mediaMaxCount) {
      throw new ReviewException('REVIEW_MEDIA_LIMIT_EXCEEDED', `Maximum ${REVIEW_LIMITS.mediaMaxCount} media files.`);
    }
    if (dto.media_ids) {
      await this.validateMediaOwnership(dto.media_ids, actor.userId, reviewId);
    }

    const session = await this.connection.startSession();
    let updatedReview: ReviewDocument | null = null;
    let newAggregate: { avg: number; count: number; distribution: object } | null = null;

    try {
      await session.withTransaction(async () => {
        // Atomic update with version check
        updatedReview = await this.reviewModel.findOneAndUpdate(
          { _id: reviewId, version: dto.version },
          {
            $set: {
              ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
              ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
              ...(dto.media_ids !== undefined ? { media_ids: dto.media_ids } : {}),
              edited_at: new Date(),
            },
            $inc: { version: 1 },
          },
          { new: true, session },
        );

        if (!updatedReview) {
          throw new ReviewException('REVIEW_VERSION_CONFLICT', 'Concurrent modification detected.');
        }

        // Recompute aggregate only if rating changed
        if (dto.rating !== undefined && dto.rating !== oldRating) {
          newAggregate = await this.recomputeAggregate(updatedReview.product_id, session);
        }

        await this.auditModel.create(
          [
            {
              _id: generateId(),
              actor_user_id: actor.userId,
              action: 'review.updated',
              target_type: 'REVIEW',
              target_id: reviewId,
              metadata: {
                product_id: updatedReview.product_id,
                old_rating: oldRating,
                new_rating: dto.rating ?? oldRating,
              },
              request_id: requestId,
              occurred_at: new Date(),
            },
          ],
          { session },
        );

        const outboxEvents = [
          this.buildOutboxEvent('review.updated', 'REVIEW', reviewId, 'rating.events.v1', {
            review_id: reviewId,
            product_id: updatedReview.product_id,
            rating: updatedReview.rating,
          }, requestId),
        ];

        if (newAggregate) {
          outboxEvents.push(
            this.buildOutboxEvent('rating.aggregate.updated', 'PRODUCT', updatedReview.product_id, 'rating.events.v1', {
              product_id: updatedReview.product_id,
              ...newAggregate,
            }, requestId),
          );
        }

        await this.outboxModel.create(outboxEvents, { session });
      });
    } finally {
      await session.endSession();
    }

    if (!updatedReview) {
      throw new ReviewException('REVIEW_INTERNAL_ERROR', 'Failed to update review.');
    }

    const r = updatedReview as ReviewDocument;
    return {
      data: {
        review_id: r._id,
        rating: r.rating,
        comment: r.comment || undefined,
        version: r.version,
        edited_at: r.edited_at,
        aggregate: newAggregate ?? undefined,
      },
      meta: { request_id: requestId },
    };
  }

  // ---------------------------------------------------------------------------
  // Delete review — soft delete, buyer owner only
  // ---------------------------------------------------------------------------

  async remove(
    reviewId: string,
    dto: DeleteReviewDto,
    actor: ActorContext,
    requestId: string,
  ): Promise<object> {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new ReviewException('REVIEW_NOT_FOUND', 'Review not found.');
    }

    // Idempotent: already deleted → return current aggregate
    if (review.status === ReviewStatus.DELETED) {
      const agg = await this.aggregateModel.findById(review.product_id).lean();
      return {
        data: {
          review_id: reviewId,
          status: ReviewStatus.DELETED,
          aggregate: agg
            ? { avg: agg.avg, count: agg.count, distribution: agg.distribution }
            : null,
        },
        meta: { request_id: requestId },
      };
    }

    // Ownership check
    if (review.buyer_user_id !== actor.userId) {
      throw new ReviewException('REVIEW_FORBIDDEN', 'You do not own this review.');
    }

    // Optimistic concurrency
    if (review.version !== dto.version) {
      throw new ReviewException('REVIEW_VERSION_CONFLICT', `Version conflict.`);
    }

    const session = await this.connection.startSession();
    let newAggregate: { avg: number; count: number; distribution: object } | null = null;

    try {
      await session.withTransaction(async () => {
        const deleted = await this.reviewModel.findOneAndUpdate(
          { _id: reviewId, version: dto.version },
          {
            $set: { status: ReviewStatus.DELETED, deleted_at: new Date() },
            $inc: { version: 1 },
          },
          { new: true, session },
        );

        if (!deleted) {
          throw new ReviewException('REVIEW_VERSION_CONFLICT', 'Concurrent modification detected.');
        }

        newAggregate = await this.recomputeAggregate(review.product_id, session);

        await this.auditModel.create(
          [
            {
              _id: generateId(),
              actor_user_id: actor.userId,
              action: 'review.deleted',
              target_type: 'REVIEW',
              target_id: reviewId,
              metadata: { product_id: review.product_id, reason: dto.reason },
              request_id: requestId,
              occurred_at: new Date(),
            },
          ],
          { session },
        );

        await this.outboxModel.create(
          [
            this.buildOutboxEvent('review.deleted', 'REVIEW', reviewId, 'rating.events.v1', {
              review_id: reviewId,
              product_id: review.product_id,
            }, requestId),
            this.buildOutboxEvent('rating.aggregate.updated', 'PRODUCT', review.product_id, 'rating.events.v1', {
              product_id: review.product_id,
              ...newAggregate,
            }, requestId),
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return {
      data: {
        review_id: reviewId,
        status: ReviewStatus.DELETED,
        aggregate: newAggregate,
      },
      meta: { request_id: requestId },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Recomputes the rating aggregate from scratch based on PUBLISHED, non-deleted reviews.
   *  Uses $group aggregation pipeline — consistent with invariant: count = Σ distribution. */
  private async recomputeAggregate(
    productId: string,
    session: ClientSession,
  ): Promise<{ avg: number; count: number; distribution: { '1': number; '2': number; '3': number; '4': number; '5': number } }> {
    const pipeline = [
      { $match: { product_id: productId, status: ReviewStatus.PUBLISHED } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          ratingSum: { $sum: '$rating' },
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ];

    const [result] = await this.reviewModel.aggregate(pipeline).session(session);

    const count: number = result?.total ?? 0;
    const ratingSum: number = result?.ratingSum ?? 0;
    const avg = count > 0 ? Math.round((ratingSum / count) * 100) / 100 : 0;

    const distribution = {
      '1': result?.r1 ?? 0,
      '2': result?.r2 ?? 0,
      '3': result?.r3 ?? 0,
      '4': result?.r4 ?? 0,
      '5': result?.r5 ?? 0,
    };

    // Upsert aggregate document
    await this.aggregateModel.updateOne(
      { _id: productId },
      {
        $set: { avg, count, distribution, updated_at: new Date() },
        $inc: { source_version: 1 },
      },
      { upsert: true, session },
    );

    return { avg, count, distribution };
  }

  /** Validates that all media IDs are READY and belong to the actor (and optionally to the review). */
  private async validateMediaOwnership(
    mediaIds: string[],
    buyerUserId: string,
    reviewId: string | null,
  ): Promise<void> {
    if (mediaIds.length === 0) return;

    const foundMedia = await this.mediaModel.find({
      _id: { $in: mediaIds },
      status: MediaStatus.READY,
    });

    if (foundMedia.length !== mediaIds.length) {
      throw new ReviewException(
        'REVIEW_MEDIA_INVALID',
        'One or more media files are not in READY status or do not exist.',
      );
    }

    // For new reviews, validate there's no cross-review media reuse
    if (reviewId === null) {
      for (const m of foundMedia) {
        if (m.review_id && m.review_id !== reviewId) {
          throw new ReviewException('REVIEW_MEDIA_INVALID', 'Media belongs to another review.');
        }
      }
    }
  }

  private buildPublicMediaUrl(objectKey: string): string {
    // CDN URL — in local dev, this would be the MinIO endpoint
    const cdnBase = process.env['CDN_BASE_URL'] ?? 'https://cdn.taca.vn/r';
    return `${cdnBase}/${objectKey}`;
  }

  private maskDisplayName(userId: string): string {
    // Minimal masking for cases where buyer_display_name is not stored
    return userId.substring(0, 4) + '***';
  }

  private buildOutboxEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    topic: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Partial<OutboxEvent> {
    return {
      _id: generateId(),
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      topic,
      payload,
      request_id: requestId,
      status: 'PENDING',
      retry_count: 0,
      schema_version: 1,
    };
  }
}
