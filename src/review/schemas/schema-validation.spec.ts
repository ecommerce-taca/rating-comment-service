import { ReviewSchema } from './review.schema';
import { SellerReplySchema } from './seller-reply.schema';
import { ReviewMediaSchema } from './review-media.schema';
import { RatingAggregateSchema } from './rating-aggregate.schema';

describe('Schema Definitions & Index Specifications', () => {
  it('enforces compound unique index on Review (order_id, product_id, buyer_user_id)', () => {
    const indexes = ReviewSchema.indexes();
    const uniqueReviewIndex = indexes.find(
      ([fields, options]) =>
        options?.unique === true &&
        fields['order_id'] === 1 &&
        fields['product_id'] === 1 &&
        fields['buyer_user_id'] === 1,
    );

    expect(uniqueReviewIndex).toBeDefined();
    expect(uniqueReviewIndex?.[1]?.name).toBe('uq_review_order_product_buyer');
  });

  it('enforces unique index on SellerReply review_id', () => {
    const indexes = SellerReplySchema.indexes();
    const uniqueReplyIndex = indexes.find(
      ([fields, options]) => options?.unique === true && fields['review_id'] === 1,
    );

    expect(uniqueReplyIndex).toBeDefined();
    expect(uniqueReplyIndex?.[1]?.name).toBe('uq_reply_review_id');
  });

  it('enforces unique index on ReviewMedia object_key', () => {
    const indexes = ReviewMediaSchema.indexes();
    const uniqueMediaIndex = indexes.find(
      ([fields, options]) => options?.unique === true && fields['object_key'] === 1,
    );

    expect(uniqueMediaIndex).toBeDefined();
    expect(uniqueMediaIndex?.[1]?.name).toBe('uq_media_object_key');
  });

  it('configures RatingAggregate schema with required distribution fields', () => {
    const distributionPath = RatingAggregateSchema.path('distribution');
    expect(distributionPath).toBeDefined();
    expect(RatingAggregateSchema.path('avg')).toBeDefined();
    expect(RatingAggregateSchema.path('count')).toBeDefined();
  });
});
