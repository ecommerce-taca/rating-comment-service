import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractActor } from '../context/actor-context.decorator';
import { ReviewException } from '../../common/filters/http-exception.filter';

/** Guard verifying that the actor has SELLER or SELLER_STAFF role.
 *  Shop-level ownership matching the product's shop_id is checked in the business layer.
 */
@Injectable()
export class SellerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const actor = request.actor ?? extractActor(request);

    if (!actor || !actor.userId) {
      throw new ReviewException('REVIEW_UNAUTHENTICATED', 'Authentication required.');
    }

    const isSeller =
      actor.roles.includes('SELLER') ||
      actor.roles.includes('SELLER_STAFF') ||
      actor.roles.includes('SUPER_ADMIN');

    if (!isSeller) {
      throw new ReviewException(
        'REVIEW_FORBIDDEN',
        'Actor does not possess seller role required for replies.',
      );
    }

    return true;
  }
}
