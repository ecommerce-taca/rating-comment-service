import { EventEnvelope } from './event-envelope.interface';

export interface KafkaPublishOptions {
  key?: string;
  headers?: Record<string, string>;
}

/** Port for publishing Kafka events. */
export interface KafkaProducerPort {
  publish<T extends Record<string, unknown>>(
    topic: string,
    event: EventEnvelope<T>,
    options?: KafkaPublishOptions,
  ): Promise<void>;
}

export const KAFKA_PRODUCER_PORT = Symbol('KAFKA_PRODUCER_PORT');
