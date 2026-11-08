import { IsEnum, IsInt, IsOptional, IsString, IsBoolean, Min, Max } from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';

class EnvironmentVariables {
  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  SERVICE_NAME: string = 'rating-comment-service';

  @IsString()
  SERVICE_VERSION: string = '0.1.0';

  @IsInt() @Min(1) @Max(65535)
  @Transform(({ value }) => parseInt(value as string, 10))
  PORT: number = 3000;

  @IsString()
  MONGODB_URI!: string;

  @IsString()
  @IsOptional()
  MONGODB_DB_NAME: string = 'ratingdb';

  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'log';

  // Kafka
  @IsString()
  @IsOptional()
  KAFKA_BROKERS: string = 'localhost:9092';

  @IsString()
  @IsOptional()
  KAFKA_CLIENT_ID: string = 'rating-comment-service';

  @IsString()
  @IsOptional()
  KAFKA_GROUP_ID: string = 'rating-comment-service';

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  KAFKA_ENABLED: boolean = false;

  // S3 / MinIO
  @IsString()
  @IsOptional()
  S3_ENDPOINT: string = 'http://localhost:9000';

  @IsString()
  @IsOptional()
  S3_REGION: string = 'us-east-1';

  @IsString()
  @IsOptional()
  S3_BUCKET: string = 'rating-media';

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY: string = 'minioadmin';

  @IsString()
  @IsOptional()
  S3_SECRET_KEY: string = 'minioadmin123';

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  S3_FORCE_PATH_STYLE: boolean = true;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  S3_ENABLED: boolean = false;

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  MEDIA_SIGNED_URL_TTL_SECONDS: number = 600;

  // Business config
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  REVIEW_EDIT_WINDOW_DAYS: number = 30;

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  REVIEW_MEDIA_MAX_COUNT: number = 6;

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  REVIEW_IMAGE_MAX_SIZE_BYTES: number = 10 * 1024 * 1024;
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false,
  });

  // Manual required field check for MONGODB_URI before class-validator
  if (typeof config['MONGODB_URI'] !== 'string' || !(config['MONGODB_URI'] as string).trim()) {
    throw new Error('Missing required environment variable: MONGODB_URI');
  }

  return { ...config, ...validated } as Record<string, unknown>;
}
