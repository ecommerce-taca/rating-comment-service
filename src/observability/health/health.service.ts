import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  live() { return { status: 'ok', service: process.env.SERVICE_NAME ?? 'rating-comment-service' }; }
  ready() {
    const mongoReady = this.connection.readyState === 1;
    const kafkaConfigured = process.env.KAFKA_ENABLED !== 'true' || Boolean(process.env.KAFKA_BROKERS);
    const s3Configured = process.env.S3_ENABLED !== 'true' || Boolean(process.env.S3_BUCKET && process.env.S3_ENDPOINT);
    if (!mongoReady || !kafkaConfigured || !s3Configured) throw new ServiceUnavailableException({ status: 'not_ready', dependencies: { mongodb: mongoReady, kafka_configured: kafkaConfigured, s3_configured: s3Configured } });
    return { status: 'ready', dependencies: { mongodb: true, kafka_configured: kafkaConfigured, s3_configured: s3Configured } };
  }
}
