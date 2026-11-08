import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Connection } from 'mongoose';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(() => {
    const mockConnection = {
      readyState: 1,
    } as unknown as Connection;

    service = new HealthService(mockConnection);
    controller = new HealthController(service);
  });

  describe('live()', () => {
    it('returns status ok for process liveness check', () => {
      const response = controller.live();
      expect(response.status).toBe('ok');
      expect(response.service).toBe('rating-comment-service');
    });
  });

  describe('ready()', () => {
    it('returns ready when MongoDB is connected', () => {
      const response = controller.ready();
      expect(response.status).toBe('ready');
      expect(response.dependencies.mongodb).toBe(true);
    });

    it('throws ServiceUnavailableException when MongoDB is not connected', () => {
      const disconnectedConnection = {
        readyState: 0,
      } as unknown as Connection;

      const degradedService = new HealthService(disconnectedConnection);
      const degradedController = new HealthController(degradedService);

      expect(() => degradedController.ready()).toThrow(ServiceUnavailableException);
    });
  });
});
