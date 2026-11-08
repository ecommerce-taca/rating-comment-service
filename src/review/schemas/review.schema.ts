import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReviewStatus } from '../../common/enums/review-status.enum';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({
  collection: 'reviews',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class Review {
  /** UUIDv7 string — explicit _id avoids MongoDB ObjectId */
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true, index: true })
  product_id!: string;

  @Prop({ type: String, required: true, index: true })
  shop_id!: string;

  @Prop({ type: String, required: true })
  order_id!: string;

  @Prop({ type: String, required: true })
  sku_id!: string;

  /** Optional SKU label for display (e.g. "Đen / 65W") — snapshot at create time */
  @Prop({ type: String, default: '' })
  variant_label!: string;

  @Prop({ type: String, required: true, index: true })
  buyer_user_id!: string;

  /** Masked display name for public response — stored separately to avoid exposing raw PII */
  @Prop({ type: String, default: '' })
  buyer_display_name!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: { validator: Number.isInteger, message: 'Rating must be an integer' },
  })
  rating!: number;

  @Prop({ type: String, default: '', maxlength: 5000 })
  comment!: string;

  /** Always set server-side from Order eligibility — never trusted from client */
  @Prop({ type: Boolean, required: true, default: false })
  is_verified_purchase!: boolean;

  @Prop({
    type: String,
    enum: Object.values(ReviewStatus),
    default: ReviewStatus.PUBLISHED,
    index: true,
  })
  status!: ReviewStatus;

  /** Optimistic concurrency version — increment on each mutation */
  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  /** IDs of media files in READY state attached to this review */
  @Prop({ type: [String], default: [] })
  media_ids!: string[];

  @Prop({ type: Date, default: null })
  edited_at!: Date | null;

  @Prop({ type: Date, default: null })
  deleted_at!: Date | null;

  // Auto-managed by timestamps option:
  created_at!: Date;
  updated_at!: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// Unique constraint: one review per (order, product, buyer)
ReviewSchema.index(
  { order_id: 1, product_id: 1, buyer_user_id: 1 },
  { unique: true, name: 'uq_review_order_product_buyer' },
);

// Public listing query: product + published + newest
ReviewSchema.index({ product_id: 1, status: 1, created_at: -1 }, { name: 'idx_review_product_status_created' });

// Seller dashboard
ReviewSchema.index({ shop_id: 1, status: 1, created_at: -1 }, { name: 'idx_review_shop_status_created' });

// Buyer's own reviews
ReviewSchema.index({ buyer_user_id: 1, created_at: -1 }, { name: 'idx_review_buyer_created' });
