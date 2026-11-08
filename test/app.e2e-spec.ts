import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mockModel = {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0),
      findById: jest.fn().mockReturnThis(),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      create: jest.fn().mockResolvedValue([]),
    };

    const mockConnection = {
      readyState: 1,
      models: {} as Record<string, unknown>,
      model: jest.fn().mockReturnValue(mockModel),
      getClient: () => ({
        topology: { description: { type: 'ReplicaSetWithPrimary' } },
      }),
      startSession: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getConnectionToken())
      .useValue(mockConnection)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/health/live (GET) returns status ok', () =>
    request(app.getHttpAdapter().getInstance())
      .get('/health/live')
      .expect(200)
      .expect(({ body }: { body: { status: string; service: string } }) => {
        expect(body.status).toBe('ok');
        expect(body.service).toBe('rating-comment-service');
      }));
});
