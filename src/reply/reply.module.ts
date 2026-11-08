import { Module } from '@nestjs/common';
import { ReplyService } from './reply.service';
@Module({ providers: [ReplyService], exports: [ReplyService] })
export class ReplyModule {}
