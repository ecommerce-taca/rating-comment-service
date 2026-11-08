import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractActor } from '../context/actor-context.decorator';
import { ReviewException } from '../../common/filters/http-exception.filter';

/** Guard enforcing that a valid authenticated actor exists (non-anonymous). */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const actor = request.actor ?? extractActor(request);

    if (!actor || !actor.userId) {
      throw new ReviewException('REVIEW_UNAUTHENTICATED', 'Authentication required for this operation.');
    }

    return true;
  }
}
