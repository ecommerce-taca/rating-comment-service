import { Module, Global } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KAFKA_PRODUCER_PORT } from '../integration/kafka/kafka-producer.port';

@Global()
@Module({
  providers: [
    KafkaProducerService,
    {
      provide: KAFKA_PRODUCER_PORT,
      useExisting: KafkaProducerService,
    },
  ],
  exports: [KafkaProducerService, KAFKA_PRODUCER_PORT],
})
export class KafkaModule {}
