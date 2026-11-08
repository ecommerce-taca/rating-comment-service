import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

export type OutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED' | 'DLQ';

@Schema({
  collection: 'outbox_events',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class OutboxEvent {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true })
  event_type!: string;

  @Prop({ type: String, required: true })
  aggregate_type!: string;

  @Prop({ type: String, required: true, index: true })
  aggregate_id!: string;

  @Prop({ type: String, required: true })
  topic!: string;

  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  @Prop({ type: String, default: null })
  traceparent!: string | null;

  @Prop({ type: String, default: null })
  request_id!: string | null;

  @Prop({
    type: String,
    enum: ['PENDING', 'PUBLISHED', 'FAILED', 'DLQ'],
    default: 'PENDING',
    index: true,
  })
  status!: OutboxStatus;

  @Prop({ type: Number, default: 0 })
  retry_count!: number;

  @Prop({ type: Date, default: null })
  published_at!: Date | null;

  @Prop({ type: Date, default: null })
  failed_at!: Date | null;

  @Prop({ type: String, default: null })
  error_message!: string | null;

  @Prop({ type: Date, default: null })
  next_retry_at!: Date | null;

  @Prop({ type: Number, required: true, default: 1 })
  schema_version!: number;

  created_at!: Date;
  updated_at!: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

// Publisher polls for PENDING events
OutboxEventSchema.index(
  { status: 1, next_retry_at: 1, created_at: 1 },
  { name: 'idx_outbox_pending' },
);

// Idempotency: prevent double-publishing same event
OutboxEventSchema.index({ aggregate_id: 1, event_type: 1, created_at: -1 }, { name: 'idx_outbox_aggregate_event' });
