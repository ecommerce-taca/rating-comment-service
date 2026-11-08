export interface ProductMetadata {
  product_id: string;
  shop_id: string;
  name: string;
  is_active: boolean;
}

/** Port for reading product metadata (such as shop ownership and product status). */
export interface ProductMetadataPort {
  getProduct(productId: string): Promise<ProductMetadata | null>;
}

export const PRODUCT_METADATA_PORT = Symbol('PRODUCT_METADATA_PORT');
