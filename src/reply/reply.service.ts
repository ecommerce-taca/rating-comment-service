import { Injectable, NotImplementedException } from '@nestjs/common';
@Injectable()
export class ReplyService {
  create(): never { throw new NotImplementedException('Seller reply requires trusted seller/shop scope and repository implementation.'); }
  update(): never { throw new NotImplementedException('Seller reply update is not implemented.'); }
  remove(): never { throw new NotImplementedException('Seller reply soft-delete is not implemented.'); }
}
