import { Request, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('propagates a valid incoming X-Request-ID header', () => {
    const req = {
      headers: {
        'x-request-id': 'custom-req-12345',
      },
    } as unknown as Request & { requestId: string };

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    RequestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('custom-req-12345');
    expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', 'custom-req-12345');
    expect(next).toHaveBeenCalled();
  });

  it('generates a new valid UUIDv7 if incoming X-Request-ID is missing', () => {
    const req = {
      headers: {},
    } as unknown as Request & { requestId: string };

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    RequestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBe(36);
    expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('generates a new UUIDv7 if incoming X-Request-ID contains illegal characters', () => {
    const req = {
      headers: {
        'x-request-id': 'invalid/id<with>script',
      },
    } as unknown as Request & { requestId: string };

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    RequestIdMiddleware(req, res, next);

    expect(req.requestId).not.toBe('invalid/id<with>script');
    expect(req.requestId.length).toBe(36);
    expect(next).toHaveBeenCalled();
  });
});
