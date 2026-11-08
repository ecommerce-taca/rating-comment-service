export interface PresignedUploadUrlResult {
  media_id: string;
  object_key: string;
  upload_url: string;
  expires_at: Date;
}

export interface ObjectVerificationResult {
  exists: boolean;
  size_bytes?: number;
  content_type?: string;
  etag?: string;
}

/** Port for object storage operations (S3 / MinIO).
 *  Bytes are NEVER uploaded through the API server; client uploads directly via signed URLs. */
export interface MediaStoragePort {
  generateUploadUrl(
    reviewId: string,
    mediaId: string,
    contentType: string,
    ttlSeconds: number,
  ): Promise<PresignedUploadUrlResult>;

  verifyObject(objectKey: string): Promise<ObjectVerificationResult>;

  getPublicUrl(objectKey: string): string;

  deleteObject(objectKey: string): Promise<void>;
}

export const MEDIA_STORAGE_PORT = Symbol('MEDIA_STORAGE_PORT');
