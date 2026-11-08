import { Global, Module, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';
import { DatabaseInitializerService } from './database-initializer.service';

@Injectable()
export class DatabaseTransactionService {
  private readonly logger = new Logger(DatabaseTransactionService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Checks whether the connected MongoDB supports multi-document transactions (replica set or mongos). */
  supportsTransactions(): boolean {
    const client = this.connection.getClient() as unknown as {
      topology?: { description?: { type?: string } };
    };
    const topologyType = client?.topology?.description?.type;
    return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
  }

  /** Executes an operation inside a MongoDB session transaction if replica set is active.
   *  Falls back to a direct execution if running on standalone MongoDB in dev/test.
   */
  async withTransaction<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
    let session: ClientSession | null = null;
    try {
      session = await this.connection.startSession();
      let result: T;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result!;
    } catch (error) {
      const msg = (error as Error).message;
      if (
        msg.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
        msg.includes('This MongoDB deployment does not support retryable writes')
      ) {
        this.logger.warn(
          'MongoDB standalone detected — executing operation without multi-document transaction.',
        );
        return fn(null);
      }
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
}

@Global()
@Module({
  providers: [
    DatabaseTransactionService,
    DatabaseInitializerService,
  ],
  exports: [
    DatabaseTransactionService,
  ],
})
export class DatabaseModule {}