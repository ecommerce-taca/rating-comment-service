import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewMedia, ReviewMediaSchema } from './schemas/review-media.schema';
import { SellerReply, SellerReplySchema } from './schemas/seller-reply.schema';
import { RatingAggregate, RatingAggregateSchema } from './schemas/rating-aggregate.schema';
import { ReviewAudit, ReviewAuditSchema } from './schemas/review-audit.schema';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { AggregateModule } from '../aggregate/aggregate.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: ReviewMedia.name, schema: ReviewMediaSchema },
      { name: SellerReply.name, schema: SellerReplySchema },
      { name: RatingAggregate.name, schema: RatingAggregateSchema },
      { name: ReviewAudit.name, schema: ReviewAuditSchema },
    ]),
    EligibilityModule,
    AggregateModule,
    OutboxModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
