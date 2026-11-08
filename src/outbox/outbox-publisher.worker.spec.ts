import { OutboxPublisherWorker } from './outbox-publisher.worker';
import { OutboxEventDocument } from './schemas/outbox-event.schema';
import { Model } from 'mongoose';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

describe('OutboxPublisherWorker', () => {
  let worker: OutboxPublisherWorker;
  let mockOutboxModel: jest.Mocked<Model<OutboxEventDocument>>;
  let mockKafkaProducer: jest.Mocked<KafkaProducerService>;

  beforeEach(() => {
    mockOutboxModel = {
      find: jest.fn(),
      updateOne: jest.fn(),
    } as unknown as jest.Mocked<Model<OutboxEventDocument>>;

    mockKafkaProducer = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<KafkaProducerService>;

    worker = new OutboxPublisherWorker(mockOutboxModel, mockKafkaProducer);
  });

  afterEach(() => {
    worker.onModuleDestroy();
  });

  describe('processBatch', () => {
    it('successfully publishes pending events and marks them as PUBLISHED', async () => {
      const mockEvent = {
        _id: 'event-001',
        event_type: 'review.created',
        aggregate_type: 'REVIEW',
        aggregate_id: 'review-123',
        topic: 'rating.events.v1',
        payload: { rating: 5 },
        request_id: 'req-001',
        traceparent: 'trace-001',
        status: 'PENDING',
        retry_count: 0,
        created_at: new Date('2026-11-08T10:00:00Z'),
      };

      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockEvent]),
      });
      mockOutboxModel.find.mockReturnValue({ sort: sortMock } as any);
      mockKafkaProducer.publish.mockResolvedValue(undefined);
      mockOutboxModel.updateOne.mockResolvedValue({ acknowledged: true } as any);

      const processed = await worker.processBatch();

      expect(processed).toBe(1);
      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        'rating.events.v1',
        expect.objectContaining({
          event_id: 'event-001',
          event_type: 'review.created',
          aggregate_id: 'review-123',
        }),
        expect.objectContaining({
          key: 'review-123',
          headers: expect.objectContaining({
            request_id: 'req-001',
            aggregate_type: 'REVIEW',
          }),
        }),
      );
      expect(mockOutboxModel.updateOne).toHaveBeenCalledWith(
        { _id: 'event-001' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'PUBLISHED',
            error_message: null,
          }),
        }),
      );
    });

    it('handles publish failure with exponential backoff on retry 1 and 2', async () => {
      const mockEvent = {
        _id: 'event-002',
        event_type: 'review.created',
        aggregate_type: 'REVIEW',
        aggregate_id: 'review-456',
        topic: 'rating.events.v1',
        payload: { rating: 4 },
        retry_count: 0,
        created_at: new Date(),
      };

      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockEvent]),
      });
      mockOutboxModel.find.mockReturnValue({ sort: sortMock } as any);
      mockKafkaProducer.publish.mockRejectedValue(new Error('Broker unavailable'));
      mockOutboxModel.updateOne.mockResolvedValue({ acknowledged: true } as any);

      const processed = await worker.processBatch();

      expect(processed).toBe(0);
      expect(mockOutboxModel.updateOne).toHaveBeenCalledWith(
        { _id: 'event-002' },
        expect.objectContaining({
          $set: expect.objectContaining({
            retry_count: 1,
            error_message: 'Broker unavailable',
          }),
        }),
      );
    });

    it('forwards to DLQ when max retries are exceeded (attempt 3)', async () => {
      const mockEvent = {
        _id: 'event-003',
        event_type: 'review.created',
        aggregate_type: 'REVIEW',
        aggregate_id: 'review-789',
        topic: 'rating.events.v1',
        payload: { rating: 1 },
        retry_count: 2, // Next attempt will be 3 (>= MAX_OUTBOX_RETRIES)
        created_at: new Date(),
      };

      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockEvent]),
      });
      mockOutboxModel.find.mockReturnValue({ sort: sortMock } as any);
      mockKafkaProducer.publish
        .mockRejectedValueOnce(new Error('Persistent broker failure'))
        .mockResolvedValueOnce(undefined); // DLQ publish succeeds
      mockOutboxModel.updateOne.mockResolvedValue({ acknowledged: true } as any);

      const processed = await worker.processBatch();

      expect(processed).toBe(0);
      // Verify DLQ publish
      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        'rating-comment.events.dlq.v1',
        expect.objectContaining({
          event_id: 'event-003',
          event_type: 'review.created',
          payload: expect.objectContaining({
            error: 'Persistent broker failure',
            retry_count: 3,
          }),
        }),
      );
      // Verify status set to DLQ
      expect(mockOutboxModel.updateOne).toHaveBeenCalledWith(
        { _id: 'event-003' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'DLQ',
            retry_count: 3,
            error_message: 'Persistent broker failure',
          }),
        }),
      );
    });

    it('prevents concurrent executions (idempotency / reentrancy guard)', async () => {
      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), 50))),
      });
      mockOutboxModel.find.mockReturnValue({ sort: sortMock } as any);

      // Trigger two batches concurrently
      const promise1 = worker.processBatch();
      const promise2 = worker.processBatch();

      const [res1, res2] = await Promise.all([promise1, promise2]);

      expect(res1).toBe(0);
      expect(res2).toBe(0);
      // find should only be called once because second call was guarded by isProcessing
      expect(mockOutboxModel.find).toHaveBeenCalledTimes(1);
    });
  });
});
