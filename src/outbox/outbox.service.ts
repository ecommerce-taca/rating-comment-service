import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { OutboxEvent, OutboxEventDocument } from './schemas/outbox-event.schema';
import { generateId } from '../common/utils/uuid.util';

export interface OutboxEventInput {
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  topic: string;
  payload: Record<string, unknown>;
  request_id?: string;
  traceparent?: string;
}

/** Outbox service for atomic event persistence within a MongoDB session.
 *
 *  Usage: call enqueue() inside the same Mongoose session as the domain mutation.
 *  A separate publisher worker polls PENDING events and publishes them to Kafka.
 *
 *  INVARIANT: Events are ONLY published to Kafka after the transaction commits.
 *  This prevents partial writes where the domain object is created but the event is lost.
 */
@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name) private readonly outboxModel: Model<OutboxEventDocument>,
  ) {}

  /** Persist an outbox event within an active session (call inside a transaction). */
  async enqueue(event: OutboxEventInput, session?: ClientSession): Promise<void> {
    await this.outboxModel.create(
      [
        {
          _id: generateId(),
          event_type: event.event_type,
          aggregate_type: event.aggregate_type,
          aggregate_id: event.aggregate_id,
          topic: event.topic,
          payload: event.payload,
          request_id: event.request_id ?? null,
          traceparent: event.traceparent ?? null,
          status: 'PENDING',
          retry_count: 0,
          schema_version: 1,
        },
      ],
      session ? { session } : undefined,
    );
  }
}
