import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ReviewExceptionFilter, ReviewException } from './http-exception.filter';

describe('ReviewExceptionFilter', () => {
  let filter: ReviewExceptionFilter;

  beforeEach(() => {
    filter = new ReviewExceptionFilter();
  });

  function createMockHost(requestId = 'req-test-999') {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    const mockResponse = {
      status: statusMock,
    };

    const mockRequest = {
      requestId,
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusMock, jsonMock };
  }

  it('formats ReviewException with correct status and error envelope', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new ReviewException('REVIEW_NOT_ELIGIBLE', 'Order not delivered');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'REVIEW_NOT_ELIGIBLE',
        message: 'Order not delivered',
        details: undefined,
        trace_id: 'req-test-999',
      },
    });
  });

  it('formats NestJS HttpException with standard error envelope', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new HttpException('Validation error: invalid rating', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'REVIEW_INVALID_INPUT',
        message: 'Validation error: invalid rating',
        trace_id: 'req-test-999',
      },
    });
  });

  it('sanitizes unexpected internal errors to REVIEW_INTERNAL_ERROR', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new Error('Unexpected database syntax error');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'REVIEW_INTERNAL_ERROR',
        message: 'An internal error occurred.',
        trace_id: 'req-test-999',
      },
    });
  });
});
