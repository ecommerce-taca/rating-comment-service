import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsQueryDto, DeleteReviewDto } from './dto/list-reviews-query.dto';
import { ReviewService } from './review.service';
import { Actor, OptionalActor } from '../security/context/actor-context.decorator';
import { ActorContext } from '../security/context/actor-context.interface';

@Controller()
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  /** Public — no authentication required. Returns published reviews + aggregate. */
  @Get('products/:productId/reviews')
  list(
    @Param('productId') productId: string,
    @Query() query: ListReviewsQueryDto,
    @Req() req: Request & { requestId?: string },
    @OptionalActor() _actor: ActorContext | null,
  ) {
    return this.reviews.list(productId, query, req.requestId ?? 'unknown');
  }

  /** Authenticated buyer — creates a verified review for a delivered order item. */
  @Post('products/:productId/reviews')
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @Actor() actor: ActorContext,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviews.create(productId, dto, actor, req.requestId ?? 'unknown');
  }

  /** Authenticated buyer owner — updates review within 30-day edit window. */
  @Patch('reviews/:reviewId')
  update(
    @Param('reviewId') id: string,
    @Body() dto: UpdateReviewDto,
    @Actor() actor: ActorContext,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviews.update(id, dto, actor, req.requestId ?? 'unknown');
  }

  /** Authenticated buyer owner — soft-deletes a review. */
  @Delete('reviews/:reviewId')
  remove(
    @Param('reviewId') id: string,
    @Body() dto: DeleteReviewDto,
    @Actor() actor: ActorContext,
    @Req() req: Request & { requestId?: string },
  ) {
    return this.reviews.remove(id, dto, actor, req.requestId ?? 'unknown');
  }
}
