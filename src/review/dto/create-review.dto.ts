import { IsEnum, IsInt, IsOptional, IsString, IsBoolean, IsArray, ArrayMaxSize, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { REVIEW_LIMITS } from '../../common/constants/review.constants';

export class CreateReviewDto {
  @IsString()
  order_id!: string;

  @IsString()
  sku_id!: string;

  @IsInt()
  @Min(REVIEW_LIMITS.ratingMin)
  @Max(REVIEW_LIMITS.ratingMax)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_LIMITS.commentMaxLength)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_LIMITS.mediaMaxCount)
  @IsString({ each: true })
  media_ids?: string[];
}
