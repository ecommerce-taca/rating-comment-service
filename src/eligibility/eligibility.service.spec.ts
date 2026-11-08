import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EligibilityService } from './eligibility.service';
import { DeliveredOrderCache } from './schemas/delivered-order-cache.schema';
import { ReviewException } from '../common/filters/http-exception.filter';

describe('EligibilityService', () => {
  let service: EligibilityService;
  let mockCacheModel: {
    findById: jest.Mock;
    updateOne: jest.Mock;
  };

  beforeEach(async () => {
    mockCacheModel = {
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EligibilityService,
        {
          provide: getModelToken(DeliveredOrderCache.name),
          useValue: mockCacheModel,
        },
      ],
    }).compile();

    service = module.get<EligibilityService>(EligibilityService);
  });

  it('approves eligibility when order is delivered, buyer owns order, and item matches', async () => {
    mockCacheModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'order-123',
        buyer_user_id: 'buyer-001',
        buyer_email: 'buyer@example.com',
        items: [
          { product_id: 'prod-456', sku_id: 'sku-789', shop_id: 'shop-999' },
        ],
        delivered_at: new Date(),
      }),
    });

    const result = await service.verify({
      buyerUserId: 'buyer-001',
      orderId: 'order-123',
      productId: 'prod-456',
      skuId: 'sku-789',
    });

    expect(result.eligible).toBe(true);
    expect(result.shopId).toBe('shop-999');
  });

  it('rejects eligibility when buyer is not the order owner', async () => {
    mockCacheModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'order-123',
        buyer_user_id: 'different-buyer',
        items: [{ product_id: 'prod-456', sku_id: 'sku-789' }],
        delivered_at: new Date(),
      }),
    });

    const result = await service.verify({
      buyerUserId: 'buyer-001',
      orderId: 'order-123',
      productId: 'prod-456',
      skuId: 'sku-789',
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_ITEM_OWNER');
  });

  it('rejects eligibility when product/sku is not in the delivered order', async () => {
    mockCacheModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'order-123',
        buyer_user_id: 'buyer-001',
        items: [{ product_id: 'other-prod', sku_id: 'other-sku' }],
        delivered_at: new Date(),
      }),
    });

    const result = await service.verify({
      buyerUserId: 'buyer-001',
      orderId: 'order-123',
      productId: 'prod-456',
      skuId: 'sku-789',
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PRODUCT_NOT_IN_ORDER');
  });

  it('throws REVIEW_DEPENDENCY_UNAVAILABLE when order is not found in cache', async () => {
    mockCacheModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.verify({
        buyerUserId: 'buyer-001',
        orderId: 'order-not-delivered',
        productId: 'prod-456',
        skuId: 'sku-789',
      }),
    ).rejects.toThrow(ReviewException);
  });

  it('caches delivered order idempotently using upsert', async () => {
    const deliveredAt = new Date();
    await service.cacheDeliveredOrder(
      'order-123',
      'buyer-001',
      'buyer@example.com',
      [{ product_id: 'prod-456', sku_id: 'sku-789' }],
      deliveredAt,
    );

    expect(mockCacheModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-123' },
      {
        $set: {
          buyer_user_id: 'buyer-001',
          buyer_email: 'buyer@example.com',
          items: [{ product_id: 'prod-456', sku_id: 'sku-789' }],
          delivered_at: deliveredAt,
        },
      },
      { upsert: true },
    );
  });
});
