import { Module, Global } from '@nestjs/common';
import { ActorContextGuard } from './guards/actor-context.guard';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { SellerGuard } from './guards/seller.guard';

@Global()
@Module({
  providers: [ActorContextGuard, AuthenticatedGuard, SellerGuard],
  exports: [ActorContextGuard, AuthenticatedGuard, SellerGuard],
})
export class SecurityModule {}
