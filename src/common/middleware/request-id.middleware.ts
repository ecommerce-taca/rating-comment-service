import { Request, Response, NextFunction } from 'express';
import { generateId } from '../utils/uuid.util';

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID_RE = /^[A-Za-z0-9._:+-]{1,64}$/;

/** Reads X-Request-ID from incoming request (Gateway-injected or generated).
 *  Attaches it to req.requestId and sets it on the outgoing response header.
 *  Never trusts a client-supplied header directly — Gateway strips those.
 *  Here we just ensure a request ID always exists for correlation.
 */
export function RequestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER] as string | undefined;
  const requestId =
    incoming && VALID_REQUEST_ID_RE.test(incoming) ? incoming : generateId();

  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
