import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeliveredOrderCache, DeliveredOrderCacheDocument } from './schemas/delivered-order-cache.schema';
import { ReviewEligibilityInput, ReviewEligibilityResult } from './eligibility.types';
import { ReviewException } from '../common/filters/http-exception.filter';

/**
 * Verifies buyer eligibility to review a product.
 *
 * Strategy: event-sourced cache from `order.delivered` Kafka events.
 * - If order is in cache: fully synchronous, low latency.
 * - If order NOT in cache: return UNKNOWN reason + throw REVIEW_DEPENDENCY_UNAVAILABLE.
 *   This is a conservative fallback — the order may have been delivered but the event
 *   not yet processed. In production, an optional REST fallback to Order Service could
 *   be added behind the OrderVerificationPort.
 *
 * IMPORTANT: The client NEVER controls is_verified_purchase.
 * This service sets the eligibility; ReviewService sets is_verified_purchase=true only on success.
 */
@Injectable()
export class EligibilityService {
  private readonly logger = new Logger(EligibilityService.name);

  constructor(
    @InjectModel(DeliveredOrderCache.name)
    private readonly cacheModel: Model<DeliveredOrderCacheDocument>,
  ) {}

  async verify(input: ReviewEligibilityInput): Promise<ReviewEligibilityResult> {
    const { buyerUserId, orderId, productId, skuId } = input;

    // Look up delivered order cache
    const cachedOrder = await this.cacheModel.findById(orderId).lean();

    if (!cachedOrder) {
      // Order not in cache — either not delivered or event not yet processed
      this.logger.warn(
        `Order ${orderId} not found in delivered cache for buyer ${buyerUserId}`,
      );
      throw new ReviewException(
        'REVIEW_DEPENDENCY_UNAVAILABLE',
        'Order delivery status cannot be verified at this time. Please try again shortly.',
      );
    }

    // Verify buyer owns this order
    if (cachedOrder.buyer_user_id !== buyerUserId) {
      return { eligible: false, reason: 'NOT_ITEM_OWNER' };
    }

    // Verify product+SKU exists in order items
    const matchingItem = cachedOrder.items.find(
      (item) => item.product_id === productId && item.sku_id === skuId,
    );

    if (!matchingItem) {
      return { eligible: false, reason: 'PRODUCT_NOT_IN_ORDER' };
    }

    return {
      eligible: true,
      shopId: matchingItem.shop_id,
      buyerDisplayName: '', // Could be fetched from Auth User service if needed
    };
  }

  /** Called by Kafka consumer when order.delivered event arrives.
   *  Idempotent — safe to call multiple times with same order_id. */
  async cacheDeliveredOrder(
    orderId: string,
    buyerUserId: string,
    buyerEmail: string | null,
    items: Array<{ product_id: string; sku_id: string; shop_id?: string }>,
    deliveredAt: Date,
  ): Promise<void> {
    await this.cacheModel.updateOne(
      { _id: orderId },
      {
        $set: {
          buyer_user_id: buyerUserId,
          buyer_email: buyerEmail,
          items,
          delivered_at: deliveredAt,
        },
      },
      { upsert: true },
    );
    this.logger.log(`Cached delivered order ${orderId} for buyer ${buyerUserId}`);
  }
}
