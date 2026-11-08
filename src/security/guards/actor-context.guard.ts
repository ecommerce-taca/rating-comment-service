import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { extractActor } from '../context/actor-context.decorator';
import { ACTOR_KEY, ActorContext } from '../context/actor-context.interface';

declare module 'express' {
  interface Request {
    actor?: ActorContext | null;
  }
}

/** Guard that verifies the trusted proxy boundary and attaches actor context to the request.
 *  CRITICAL SECURITY: Prevents spoofed client headers from forging user/seller identities.
 */
@Injectable()
export class ActorContextGuard implements CanActivate {
  private readonly logger = new Logger(ActorContextGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Validate trusted proxy boundary if configured
    if (!this.isTrustedProxy(request)) {
      this.logger.warn('Direct untrusted request rejected: missing or invalid proxy secret header');
      throw new UnauthorizedException({
        code: 'REVIEW_UNAUTHENTICATED',
        message: 'Direct access to protected rating endpoints is not allowed.',
      });
    }

    // 2. Extract and attach actor context
    const actor = extractActor(request);
    request.actor = actor;
    (request as unknown as Record<string, unknown>)[ACTOR_KEY] = actor;

    return true;
  }

  private isTrustedProxy(request: Request): boolean {
    const expectedSecret = this.config.get<string>('ACTOR_CONTEXT_PROXY_SECRET');
    if (!expectedSecret) {
      // If secret is not configured in development/test, allow request
      return true;
    }

    const suppliedSecret = request.headers['x-taca-local-proxy-secret'];
    if (typeof suppliedSecret !== 'string') {
      return false;
    }

    try {
      const expectedBuffer = Buffer.from(expectedSecret);
      const suppliedBuffer = Buffer.from(suppliedSecret);
      return (
        expectedBuffer.length === suppliedBuffer.length &&
        timingSafeEqual(expectedBuffer, suppliedBuffer)
      );
    } catch {
      return false;
    }
  }
}
