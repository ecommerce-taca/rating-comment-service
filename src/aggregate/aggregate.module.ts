import { Module } from '@nestjs/common';
import { AggregateService } from './aggregate.service';

@Module({
  providers: [AggregateService],
  exports: [AggregateService],
})
export class AggregateModule {}
