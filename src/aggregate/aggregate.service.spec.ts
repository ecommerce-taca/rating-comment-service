import { AggregateService } from './aggregate.service';

describe('AggregateService', () => {
  const service = new AggregateService();
  it('calculates average, count and distribution', () => {
    expect(service.calculate([5, 5, 4, 3])).toEqual({
      avg: 4.25, count: 4, distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 2 },
    });
  });
  it('returns a zero aggregate for an empty list', () => {
    expect(service.calculate([])).toEqual({ avg: 0, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } });
  });
});
