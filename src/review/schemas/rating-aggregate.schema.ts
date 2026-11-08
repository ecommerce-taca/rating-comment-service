import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RatingAggregateDocument = HydratedDocument<RatingAggregate>;

export interface RatingDistribution {
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
}

@Schema({
  collection: 'rating_aggregates',
  versionKey: false,
})
export class RatingAggregate {
  /** _id = product_id — one aggregate document per product */
  @Prop({ type: String, required: true })
  declare _id: string;

  /** Average rating, 2 decimal places. 0 when no reviews. */
  @Prop({ type: Number, required: true, default: 0, min: 0, max: 5 })
  avg!: number;

  /** Total number of published, non-deleted reviews.
   *  Invariant: count === sum of all distribution values. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  count!: number;

  /** Rating distribution — keys 1..5, values ≥ 0 */
  @Prop({
    type: {
      '1': { type: Number, default: 0 },
      '2': { type: Number, default: 0 },
      '3': { type: Number, default: 0 },
      '4': { type: Number, default: 0 },
      '5': { type: Number, default: 0 },
    },
    required: true,
    _id: false,
  })
  distribution!: RatingDistribution;

  @Prop({ type: Date, required: true, default: () => new Date() })
  updated_at!: Date;

  /** Monotonically increasing version for idempotent consumer deduplication */
  @Prop({ type: Number, required: true, default: 0 })
  source_version!: number;
}

export const RatingAggregateSchema = SchemaFactory.createForClass(RatingAggregate);

// Unique by product_id (covered by _id)
// Allow efficient "recently updated products" queries
RatingAggregateSchema.index({ updated_at: -1 }, { name: 'idx_aggregate_updated' });
