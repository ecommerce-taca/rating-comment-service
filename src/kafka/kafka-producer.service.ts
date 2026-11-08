import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { EventEnvelope } from '../integration/kafka/event-envelope.interface';
import { KafkaProducerPort, KafkaPublishOptions } from '../integration/kafka/kafka-producer.port';

@Injectable()
export class KafkaProducerService implements KafkaProducerPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka?: Kafka;
  private producer?: Producer;
  private readonly isEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.isEnabled = this.config.get<boolean>('KAFKA_ENABLED', false);
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.log('Kafka producer is disabled (KAFKA_ENABLED=false)');
      return;
    }

    const brokers = (this.config.get<string>('KAFKA_BROKERS', 'localhost:9092'))
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    const clientId = this.config.get<string>('KAFKA_CLIENT_ID', 'rating-comment-service');

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.WARN,
    });

    this.producer = this.kafka.producer();
    try {
      await this.producer.connect();
      this.logger.log(`Kafka producer connected to brokers: ${brokers.join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to connect Kafka producer: ${(error as Error).message}`);
    }
  }

  async publish<T extends Record<string, unknown>>(
    topic: string,
    event: EventEnvelope<T>,
    options?: KafkaPublishOptions,
  ): Promise<void> {
    if (!this.isEnabled || !this.producer) {
      this.logger.debug(
        `[DRY RUN] Event ${event.event_type} (${event.event_id}) -> topic ${topic} (Kafka disabled)`,
      );
      return;
    }

    const key = options?.key ?? event.aggregate_id;
    const headers = {
      event_id: event.event_id,
      event_type: event.event_type,
      aggregate_id: event.aggregate_id,
      occurred_at: event.occurred_at,
      ...(event.traceparent ? { traceparent: event.traceparent } : {}),
      ...(options?.headers ?? {}),
    };

    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(event),
          headers,
        },
      ],
    });

    this.logger.debug(
      `Published event ${event.event_type} (${event.event_id}) to ${topic} [key=${key}]`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    }
  }
}
