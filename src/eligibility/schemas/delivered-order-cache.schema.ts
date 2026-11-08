import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DeliveredOrderCacheDocument = HydratedDocument<DeliveredOrderCache>;

/** Cache populated from `order.delivered` Kafka events.
 *  Used for eligibility verification without synchronous Order Service dependency.
 *  NEVER marks is_verified_purchase — that is set after verification at review creation time.
 */
@Schema({
  collection: 'delivered_order_cache',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class DeliveredOrderCache {
  @Prop({ type: String, required: true })
  declare _id: string; // = order_id

  @Prop({ type: String, required: true })
  buyer_user_id!: string;

  @Prop({ type: String, default: null })
  buyer_email!: string | null;

  @Prop({
    type: [{ product_id: String, sku_id: String, shop_id: String }],
    _id: false,
  })
  items!: Array<{ product_id: string; sku_id: string; shop_id?: string }>;

  @Prop({ type: Date, required: true })
  delivered_at!: Date;

  created_at!: Date;
  updated_at!: Date;
}

export const DeliveredOrderCacheSchema = SchemaFactory.createForClass(DeliveredOrderCache);

// Look up all delivered orders for a buyer
DeliveredOrderCacheSchema.index({ buyer_user_id: 1 }, { name: 'idx_cache_buyer' });
