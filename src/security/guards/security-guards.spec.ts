import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorContextGuard } from './actor-context.guard';
import { AuthenticatedGuard } from './authenticated.guard';
import { SellerGuard } from './seller.guard';
import { ReviewException } from '../../common/filters/http-exception.filter';

function createMockContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = {
    headers: { ...headers },
    actor: undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('Security Foundation & Guards', () => {
  describe('ActorContextGuard', () => {
    it('allows request when no ACTOR_CONTEXT_PROXY_SECRET is configured', () => {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const guard = new ActorContextGuard(configService);
      const context = createMockContext({
        'x-user-id': 'user-123',
        'x-user-roles': 'BUYER',
      });

      expect(guard.canActivate(context)).toBe(true);
      const req = context.switchToHttp().getRequest<{ actor?: { userId: string } }>();
      expect(req.actor?.userId).toBe('user-123');
    });

    it('rejects request when ACTOR_CONTEXT_PROXY_SECRET is configured but header is missing', () => {
      const configService = {
        get: jest.fn().mockImplementation((key: string) => (key === 'ACTOR_CONTEXT_PROXY_SECRET' ? 'super-secret' : undefined)),
      } as unknown as ConfigService;

      const guard = new ActorContextGuard(configService);
      const context = createMockContext({
        'x-user-id': 'user-123',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects request when ACTOR_CONTEXT_PROXY_SECRET does not match', () => {
      const configService = {
        get: jest.fn().mockImplementation((key: string) => (key === 'ACTOR_CONTEXT_PROXY_SECRET' ? 'super-secret' : undefined)),
      } as unknown as ConfigService;

      const guard = new ActorContextGuard(configService);
      const context = createMockContext({
        'x-user-id': 'user-123',
        'x-taca-local-proxy-secret': 'wrong-secret',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('accepts request when ACTOR_CONTEXT_PROXY_SECRET matches', () => {
      const configService = {
        get: jest.fn().mockImplementation((key: string) => (key === 'ACTOR_CONTEXT_PROXY_SECRET' ? 'super-secret' : undefined)),
      } as unknown as ConfigService;

      const guard = new ActorContextGuard(configService);
      const context = createMockContext({
        'x-user-id': 'user-123',
        'x-user-roles': 'SELLER,BUYER',
        'x-user-shop-scope': 'shop-abc',
        'x-taca-local-proxy-secret': 'super-secret',
      });

      expect(guard.canActivate(context)).toBe(true);
      const req = context.switchToHttp().getRequest<{ actor?: { userId: string; roles: string[]; shopScope: string[] } }>();
      expect(req.actor?.userId).toBe('user-123');
      expect(req.actor?.roles).toEqual(['SELLER', 'BUYER']);
      expect(req.actor?.shopScope).toEqual(['shop-abc']);
    });
  });

  describe('AuthenticatedGuard', () => {
    const guard = new AuthenticatedGuard();

    it('allows request when valid actor context is present', () => {
      const context = createMockContext({
        'x-user-id': 'user-123',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('throws REVIEW_UNAUTHENTICATED when actor context is missing', () => {
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(ReviewException);
      try {
        guard.canActivate(context);
      } catch (err) {
        expect((err as ReviewException).code).toBe('REVIEW_UNAUTHENTICATED');
      }
    });
  });

  describe('SellerGuard', () => {
    const guard = new SellerGuard();

    it('allows actor with SELLER role', () => {
      const context = createMockContext({
        'x-user-id': 'user-seller',
        'x-user-roles': 'SELLER',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows actor with SELLER_STAFF role', () => {
      const context = createMockContext({
        'x-user-id': 'user-staff',
        'x-user-roles': 'SELLER_STAFF',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows actor with SUPER_ADMIN role', () => {
      const context = createMockContext({
        'x-user-id': 'user-admin',
        'x-user-roles': 'SUPER_ADMIN',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects actor with only BUYER role with REVIEW_FORBIDDEN', () => {
      const context = createMockContext({
        'x-user-id': 'user-buyer',
        'x-user-roles': 'BUYER',
      });
      expect(() => guard.canActivate(context)).toThrow(ReviewException);
      try {
        guard.canActivate(context);
      } catch (err) {
        expect((err as ReviewException).code).toBe('REVIEW_FORBIDDEN');
      }
    });
  });
});
