import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ArrayMaxSize } from 'class-validator';
import { REVIEW_LIMITS } from '../../common/constants/review.constants';

export class UpdateReviewDto {
  @IsInt()
  @Min(1)
  version!: number;

  /** Rating is optional in updates — allows comment-only edits */
  @IsOptional()
  @IsInt()
  @Min(REVIEW_LIMITS.ratingMin)
  @Max(REVIEW_LIMITS.ratingMax)
  rating?: number;

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
