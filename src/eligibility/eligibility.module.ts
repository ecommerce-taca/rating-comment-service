import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveredOrderCache, DeliveredOrderCacheSchema } from './schemas/delivered-order-cache.schema';
import { EligibilityService } from './eligibility.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveredOrderCache.name, schema: DeliveredOrderCacheSchema },
    ]),
  ],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
