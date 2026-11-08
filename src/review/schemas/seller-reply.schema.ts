import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReplyStatus } from '../../common/enums/review-status.enum';

export type SellerReplyDocument = HydratedDocument<SellerReply>;

@Schema({
  collection: 'seller_replies',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class SellerReply {
  @Prop({ type: String, required: true })
  declare _id: string;

  /** One reply per review — enforced by unique index */
  @Prop({ type: String, required: true })
  review_id!: string;

  @Prop({ type: String, required: true, index: true })
  shop_id!: string;

  @Prop({ type: String, required: true })
  seller_user_id!: string;

  /** Max 2000 characters */
  @Prop({ type: String, required: true, maxlength: 2000 })
  content!: string;

  @Prop({
    type: String,
    enum: Object.values(ReplyStatus),
    default: ReplyStatus.PUBLISHED,
  })
  status!: ReplyStatus;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: Date, default: null })
  deleted_at!: Date | null;

  created_at!: Date;
  updated_at!: Date;
}

export const SellerReplySchema = SchemaFactory.createForClass(SellerReply);

// One reply per review (business rule)
SellerReplySchema.index({ review_id: 1 }, { unique: true, name: 'uq_reply_review_id' });

// Seller dashboard
SellerReplySchema.index({ shop_id: 1, updated_at: -1 }, { name: 'idx_reply_shop_updated' });
