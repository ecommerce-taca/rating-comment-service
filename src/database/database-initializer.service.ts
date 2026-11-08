
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';

const REQUIRED_MODELS = [
  'Review',
  'ReviewMedia',
  'SellerReply',
  'RatingAggregate',
  'ReviewAudit',
  'OutboxEvent',
  'DeliveredOrderCache',
] as const;

@Injectable()
export class DatabaseInitializerService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DatabaseInitializerService.name);

  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.connection.readyState !== 1) {
      throw new Error('MongoDB is not connected. Database initialization aborted.');
    }

    this.logger.log('Starting MongoDB initialization...');

    for (const modelName of REQUIRED_MODELS) {
      const model = this.connection.models[modelName] as
        | Model<unknown>
        | undefined;

      if (!model) {
        throw new Error(
          `MongoDB model "${modelName}" is not registered.`,
        );
      }

      const collectionName = model.collection.name;

this.logger.log(
  `Preparing model="${modelName}", collection="${collectionName}"`,
);

this.logger.log(
  `Declared indexes for ${modelName}: ${
    JSON.stringify(model.schema.indexes())
  }`,
);

await this.ensureCollection(model, collectionName);

this.logger.log(`Creating indexes for model="${modelName}"...`);

try {
  const createdIndexes = await model.createIndexes();

  this.logger.log(
    `Indexes ready for "${modelName}": ${JSON.stringify(createdIndexes)}`,
  );
} catch (error: unknown) {
  this.logger.error(
    `Index creation FAILED: model="${modelName}", collection="${collectionName}"`,
    error instanceof Error ? error.stack : String(error),
  );

  throw error;
}

      this.logger.log(
        `Collection "${collectionName}" and its schema indexes are ready.`,
      );
    }

    this.logger.log(
      `MongoDB initialization completed. ${REQUIRED_MODELS.length} collections checked.`,
    );
  }

  private async ensureCollection(
    model: Model<unknown>,
    collectionName: string,
  ): Promise<void> {
    try {
      await model.createCollection();

      this.logger.log(`Created collection "${collectionName}".`);
    } catch (error: unknown) {
      const mongoError = error as { code?: number };

      // MongoDB error 48 = NamespaceExists.
      // Existing collections must be preserved.
      if (mongoError?.code !== 48) {
        throw error;
      }

      this.logger.debug(
        `Collection "${collectionName}" already exists.`,
      );
    }
  }
}
