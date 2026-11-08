export interface SellerShopMetadata {
  shop_id: string;
  seller_user_id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

/** Port for verifying seller shop scope and ownership. */
export interface SellerShopMetadataPort {
  verifyShopOwnership(sellerUserId: string, shopId: string): Promise<boolean>;
}

export const SELLER_SHOP_METADATA_PORT = Symbol('SELLER_SHOP_METADATA_PORT');
