import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReviewAuditDocument = HydratedDocument<ReviewAudit>;

export type AuditAction =
  | 'review.created'
  | 'review.updated'
  | 'review.deleted'
  | 'review.hidden'
  | 'reply.created'
  | 'reply.updated'
  | 'reply.deleted'
  | 'media.upload_requested'
  | 'media.completed'
  | 'media.rejected';

@Schema({
  collection: 'review_audits',
  versionKey: false,
})
export class ReviewAudit {
  @Prop({ type: String, required: true })
  declare _id: string;

  /** ID of the user performing the action */
  @Prop({ type: String, required: true })
  actor_user_id!: string;

  @Prop({ type: String, required: true })
  action!: AuditAction;

  /** Type of the entity being acted upon */
  @Prop({ type: String, required: true, enum: ['REVIEW', 'REPLY', 'MEDIA', 'AGGREGATE'] })
  target_type!: string;

  @Prop({ type: String, required: true })
  target_id!: string;

  /** Redacted contextual metadata — must NOT contain comment text, PII, tokens, or signed URLs */
  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  /** Human-readable reason (e.g. for soft-delete) */
  @Prop({ type: String, default: '' })
  reason!: string;

  @Prop({ type: String, default: '' })
  request_id!: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  occurred_at!: Date;
}

export const ReviewAuditSchema = SchemaFactory.createForClass(ReviewAudit);

// Query: audit log for a specific entity
ReviewAuditSchema.index(
  { target_type: 1, target_id: 1, occurred_at: -1 },
  { name: 'idx_audit_target_time' },
);

// Query: actor activity log
ReviewAuditSchema.index(
  { actor_user_id: 1, occurred_at: -1 },
  { name: 'idx_audit_actor_time' },
);
