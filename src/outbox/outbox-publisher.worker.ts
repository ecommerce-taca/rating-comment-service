import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './schemas/outbox-event.schema';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { EventEnvelope } from '../integration/kafka/event-envelope.interface';

const MAX_OUTBOX_RETRIES = 3;
const POLL_INTERVAL_MS = 5000;
const DLQ_TOPIC = 'rating-comment.events.dlq.v1';

@Injectable()
export class OutboxPublisherWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private timer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    @InjectModel(OutboxEvent.name) private readonly outboxModel: Model<OutboxEventDocument>,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  onApplicationBootstrap(): void {
    // Start background polling loop
    this.timer = setInterval(() => void this.processBatch(), POLL_INTERVAL_MS);
    this.logger.log('Outbox publisher worker started');
  }

  async processBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const now = new Date();
      const pendingEvents = await this.outboxModel
        .find({
          status: 'PENDING',
          $or: [{ next_retry_at: null }, { next_retry_at: { $lte: now } }],
        })
        .sort({ created_at: 1 })
        .limit(50);

      for (const event of pendingEvents) {
        try {
          const envelope: EventEnvelope = {
            event_id: event._id,
            event_type: event.event_type,
            aggregate_id: event.aggregate_id,
            occurred_at: event.created_at ? event.created_at.toISOString() : now.toISOString(),
            payload: event.payload,
            ...(event.traceparent ? { traceparent: event.traceparent } : {}),
          };

          await this.kafkaProducer.publish(event.topic, envelope, {
            key: event.aggregate_id,
            headers: {
              request_id: event.request_id || '',
              aggregate_type: event.aggregate_type,
            },
          });

          await this.outboxModel.updateOne(
            { _id: event._id },
            {
              $set: {
                status: 'PUBLISHED',
                published_at: new Date(),
                error_message: null,
              },
            },
          );
          processedCount++;
        } catch (err) {
          const errorMsg = (err as Error).message;
          const nextRetryCount = event.retry_count + 1;

          if (nextRetryCount >= MAX_OUTBOX_RETRIES) {
            this.logger.error(
              `Outbox event ${event._id} (${event.event_type}) exceeded max retries. Moving to DLQ. Error: ${errorMsg}`,
            );

            // Forward to DLQ
            try {
              await this.kafkaProducer.publish(DLQ_TOPIC, {
                event_id: event._id,
                event_type: event.event_type,
                aggregate_id: event.aggregate_id,
                occurred_at: new Date().toISOString(),
                payload: {
                  original_payload: event.payload,
                  error: errorMsg,
                  retry_count: nextRetryCount,
                },
              });
            } catch (dlqErr) {
              this.logger.error(`Failed to forward to DLQ: ${(dlqErr as Error).message}`);
            }

            await this.outboxModel.updateOne(
              { _id: event._id },
              {
                $set: {
                  status: 'DLQ',
                  retry_count: nextRetryCount,
                  failed_at: new Date(),
                  error_message: errorMsg,
                },
              },
            );
          } else {
            // Exponential backoff: 2s, 4s, 8s
            const delayMs = Math.pow(2, nextRetryCount) * 1000;
            const nextRetryAt = new Date(Date.now() + delayMs);

            this.logger.warn(
              `Outbox event ${event._id} (${event.event_type}) publish failed (attempt ${nextRetryCount}/${MAX_OUTBOX_RETRIES}). Retrying at ${nextRetryAt.toISOString()}: ${errorMsg}`,
            );

            await this.outboxModel.updateOne(
              { _id: event._id },
              {
                $set: {
                  retry_count: nextRetryCount,
                  next_retry_at: nextRetryAt,
                  error_message: errorMsg,
                },
              },
            );
          }
        }
      }
    } catch (batchErr) {
      this.logger.error(`Error in outbox batch processing: ${(batchErr as Error).message}`);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
