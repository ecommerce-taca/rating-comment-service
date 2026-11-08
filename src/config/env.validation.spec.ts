import { validateEnvironment } from './env.validation';

describe('Environment Validation', () => {
  it('passes with minimal valid configuration', () => {
    const config = {
      MONGODB_URI: 'mongodb://localhost:27017/testdb',
      PORT: '3000',
    };
    const validated = validateEnvironment(config);
    expect(validated.MONGODB_URI).toBe('mongodb://localhost:27017/testdb');
    expect(validated.PORT).toBe(3000);
  });

  it('throws an error if MONGODB_URI is missing', () => {
    expect(() => validateEnvironment({ PORT: '3000' })).toThrow(
      'Missing required environment variable: MONGODB_URI',
    );
  });

  it('throws an error if MONGODB_URI is whitespace only', () => {
    expect(() => validateEnvironment({ MONGODB_URI: '   ', PORT: '3000' })).toThrow(
      'Missing required environment variable: MONGODB_URI',
    );
  });

  it('parses boolean environment variables correctly', () => {
    const config = {
      MONGODB_URI: 'mongodb://localhost:27017/testdb',
      KAFKA_ENABLED: 'true',
      S3_ENABLED: 'false',
    };
    const validated = validateEnvironment(config);
    expect(validated.KAFKA_ENABLED).toBe(true);
    expect(validated.S3_ENABLED).toBe(false);
  });
});
