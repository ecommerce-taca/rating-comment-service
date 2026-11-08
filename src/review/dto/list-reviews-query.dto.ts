import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { REVIEW_LIMITS } from '../../common/constants/review.constants';

export class ListReviewsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => (value !== undefined ? parseInt(value as string, 10) : undefined))
  rating?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  with_media?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value ? parseInt(value as string, 10) : 1))
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(REVIEW_LIMITS.maxPageSize)
  @Transform(({ value }) => (value ? Math.min(parseInt(value as string, 10), REVIEW_LIMITS.maxPageSize) : REVIEW_LIMITS.defaultPageSize))
  size: number = REVIEW_LIMITS.defaultPageSize;

  @IsOptional()
  @IsEnum(['newest', 'rating_desc'])
  sort: 'newest' | 'rating_desc' = 'newest';
}

export class DeleteReviewDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
