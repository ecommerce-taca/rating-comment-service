import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';

/** Maps application-level error codes to HTTP status codes */
const ERROR_CODE_TO_HTTP: Record<string, number> = {
  REVIEW_INVALID_INPUT: 400,
  REVIEW_MEDIA_INVALID: 400,
  REVIEW_UNAUTHENTICATED: 401,
  REVIEW_FORBIDDEN: 403,
  REVIEW_NOT_FOUND: 404,
  REVIEW_REPLY_NOT_FOUND: 404,
  REVIEW_NOT_ELIGIBLE: 409,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_EDIT_EXPIRED: 409,
  REVIEW_REPLY_ALREADY_EXISTS: 409,
  REVIEW_MEDIA_LIMIT_EXCEEDED: 409,
  REVIEW_VERSION_CONFLICT: 409,
  REVIEW_DEPENDENCY_UNAVAILABLE: 503,
  REVIEW_INTERNAL_ERROR: 500,
};

export class ReviewException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ReviewException';
  }

  get httpStatus(): number {
    return ERROR_CODE_TO_HTTP[this.code] ?? 500;
  }
}

@Catch()
export class ReviewExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ReviewExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const traceId = request.requestId ?? 'unknown';

    // Handle domain exceptions
    if (exception instanceof ReviewException) {
      response.status(exception.httpStatus).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          trace_id: traceId,
        },
      });
      return;
    }

    // Handle NestJS validation/HTTP exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'object' && 'message' in (exceptionResponse as object)
          ? (exceptionResponse as { message: string | string[] }).message
          : exception.message;
      response.status(status).json({
        error: {
          code: status === 400 ? 'REVIEW_INVALID_INPUT' : 'REVIEW_INTERNAL_ERROR',
          message: Array.isArray(message) ? message.join('; ') : message,
          trace_id: traceId,
        },
      });
      return;
    }

    // MongoDB duplicate key — race condition duplicate review
    if (exception instanceof MongoServerError && exception.code === 11000) {
      response.status(409).json({
        error: {
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'Review already exists for this order and product.',
          trace_id: traceId,
        },
      });
      return;
    }

    // Unknown error — redact internals
    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'REVIEW_INTERNAL_ERROR',
        message: 'An internal error occurred.',
        trace_id: traceId,
      },
    });
  }
}
