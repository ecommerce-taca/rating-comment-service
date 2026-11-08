import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { validateEnvironment } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { SecurityModule } from './security/security.module';
import { KafkaModule } from './kafka/kafka.module';
import { HealthModule } from './observability/health/health.module';
import { AggregateModule } from './aggregate/aggregate.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import { MediaModule } from './media/media.module';
import { OutboxModule } from './outbox/outbox.module';
import { ReplyModule } from './reply/reply.module';
import { ReviewModule } from './review/review.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        dbName: config.get<string>('MONGODB_DB_NAME', 'ratingdb'),
        autoIndex: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    DatabaseModule,
    SecurityModule,
    KafkaModule,
    HealthModule,
    ReviewModule,
    EligibilityModule,
    AggregateModule,
    ReplyModule,
    MediaModule,
    OutboxModule,
  ],
})
export class AppModule {}
