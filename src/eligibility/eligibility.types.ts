export interface ReviewEligibilityInput {
  buyerUserId: string;
  orderId: string;
  productId: string;
  skuId: string;
}

export interface ReviewEligibilityResult {
  eligible: boolean;
  reason?: 'NOT_DELIVERED' | 'NOT_ITEM_OWNER' | 'ALREADY_REVIEWED' | 'PRODUCT_NOT_IN_ORDER' | 'UNKNOWN';
  /** Populated on success for use in review creation */
  shopId?: string;
  buyerDisplayName?: string;
}
