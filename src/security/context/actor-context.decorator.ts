import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from './actor-context.interface';
import { ReviewException } from '../../common/filters/http-exception.filter';

function parseStringList(header: string | undefined): string[] {
  if (!header) return [];
  try {
    const parsed = JSON.parse(header);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Fall through to comma-split
  }
  return header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extracts the actor context from Gateway-injected request headers.
 *  SECURITY: These headers are ONLY trusted because Kong strips client-supplied copies
 *  before `taca-jwt` re-injects them. Never call this in unauthenticated routes. */
export function extractActor(request: Request): ActorContext | null {
  const userId = request.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') return null;

  return {
    userId,
    roles: parseStringList(request.headers['x-user-roles'] as string | undefined),
    permissions: parseStringList(request.headers['x-user-permissions'] as string | undefined),
    shopScope: parseStringList(request.headers['x-user-shop-scope'] as string | undefined),
  };
}

/** Param decorator to extract and validate actor context from request headers.
 *  Throws REVIEW_UNAUTHENTICATED if no valid actor context present. */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): ActorContext => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const actor = extractActor(request);
  if (!actor) {
    throw new ReviewException('REVIEW_UNAUTHENTICATED', 'Authentication required.');
  }
  return actor;
});

/** Optional actor — returns null for unauthenticated requests (public routes). */
export const OptionalActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return extractActor(request);
  },
);
