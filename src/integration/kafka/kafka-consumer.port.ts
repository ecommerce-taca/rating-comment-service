import { EventEnvelope } from './event-envelope.interface';

export interface KafkaMessageContext {
  topic: string;
  partition: number;
  offset: string;
  key?: string;
  headers?: Record<string, string>;
}

export type KafkaMessageHandler<T extends Record<string, unknown> = Record<string, unknown>> = (
  event: EventEnvelope<T>,
  context: KafkaMessageContext,
) => Promise<void>;

/** Port for Kafka event consumers. */
export interface KafkaConsumerPort {
  subscribe(topic: string, handler: KafkaMessageHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const KAFKA_CONSUMER_PORT = Symbol('KAFKA_CONSUMER_PORT');
