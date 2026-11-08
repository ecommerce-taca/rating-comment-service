import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OutboxEvent, OutboxEventSchema } from './schemas/outbox-event.schema';
import { OutboxService } from './outbox.service';
import { OutboxPublisherWorker } from './outbox-publisher.worker';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
    KafkaModule,
  ],
  providers: [OutboxService, OutboxPublisherWorker],
  exports: [OutboxService, MongooseModule],
})
export class OutboxModule {}
