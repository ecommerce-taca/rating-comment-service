import { Injectable } from '@nestjs/common';
export interface RatingAggregate { avg: number; count: number; distribution: Record<'1'|'2'|'3'|'4'|'5', number> }
@Injectable()
export class AggregateService {
  calculate(ratings: number[]): RatingAggregate {
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const rating of ratings) { if (Number.isInteger(rating) && rating >= 1 && rating <= 5) distribution[String(rating) as keyof typeof distribution]++; }
    const count = Object.values(distribution).reduce((sum, value) => sum + value, 0);
    const weighted = Object.entries(distribution).reduce((sum, [rating, quantity]) => sum + Number(rating) * quantity, 0);
    return { avg: count ? Math.round((weighted / count) * 100) / 100 : 0, count, distribution };
  }
}
