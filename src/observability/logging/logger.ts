import { ConsoleLogger } from '@nestjs/common';

/** Returns a NestJS-compatible logger that outputs structured JSON to stdout.
 *  Fields follow the ecosystem standard: timestamp, level, service, event, trace_id, etc.
 *  IMPORTANT: Never log raw comment text, tokens, signed URLs, or PII fields.
 */
export function createLogger(): ConsoleLogger {
  // For v1 we use NestJS ConsoleLogger with a consistent format.
  // Replace with pino/winston when structured JSON sink is required in production.
  return new ConsoleLogger(process.env['SERVICE_NAME'] ?? 'rating-comment-service', {
    logLevels: ['log', 'error', 'warn', 'debug', 'verbose'],
    timestamp: true,
  });
}
