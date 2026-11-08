import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MediaStatus } from '../../common/enums/review-status.enum';

export type ReviewMediaDocument = HydratedDocument<ReviewMedia>;

@Schema({
  collection: 'review_media',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class ReviewMedia {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, required: true, index: true })
  review_id!: string;

  /** S3/MinIO object key — unique to prevent duplicate uploads */
  @Prop({ type: String, required: true })
  object_key!: string;

  /** MIME type — image/jpeg, image/png, image/webp */
  @Prop({ type: String, required: true })
  content_type!: string;

  /** File size in bytes — validated against 10 MiB limit */
  @Prop({ type: Number, required: true, min: 1 })
  size_bytes!: number;

  /** SHA-256 hex of file content for integrity verification */
  @Prop({ type: String, required: false })
  sha256!: string;

  /** Display order within the review */
  @Prop({ type: Number, default: 0 })
  sort_order!: number;

  @Prop({
    type: String,
    enum: Object.values(MediaStatus),
    default: MediaStatus.UPLOADING,
    index: true,
  })
  status!: MediaStatus;

  @Prop({ type: Date, default: null })
  deleted_at!: Date | null;

  created_at!: Date;
  updated_at!: Date;
}

export const ReviewMediaSchema = SchemaFactory.createForClass(ReviewMedia);

// Unique object key — prevent duplicate S3 objects from being referenced
ReviewMediaSchema.index({ object_key: 1 }, { unique: true, name: 'uq_media_object_key' });

// Fetch media for a review in display order
ReviewMediaSchema.index({ review_id: 1, status: 1, sort_order: 1 }, { name: 'idx_media_review_status_order' });

// Deduplication by checksum within a review
ReviewMediaSchema.index({ review_id: 1, sha256: 1 }, { name: 'idx_media_review_sha256' });
