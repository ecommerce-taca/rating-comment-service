import { ReviewEligibilityInput, ReviewEligibilityResult } from '../../eligibility/eligibility.types';

/** Port for verifying that an order was DELIVERED and the buyer owns the purchased item. */
export interface OrderVerificationPort {
  verifyDeliveredItem(input: ReviewEligibilityInput): Promise<ReviewEligibilityResult>;
}

export const ORDER_VERIFICATION_PORT = Symbol('ORDER_VERIFICATION_PORT');
