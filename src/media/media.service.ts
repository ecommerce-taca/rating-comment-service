import { Injectable, NotImplementedException } from '@nestjs/common';
@Injectable()
export class MediaService {
  createUploadUrl(): never { throw new NotImplementedException('S3/MinIO adapter, ownership policy and upload signing are not configured.'); }
  completeUpload(): never { throw new NotImplementedException('Object HEAD/checksum/type/size verification is not implemented.'); }
}
