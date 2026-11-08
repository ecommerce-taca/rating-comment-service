export interface ApiResponse<TData> {
  data: TData;
  meta: ResponseMeta;
}

export interface ResponseMeta {
  request_id: string;
  page?: number;
  size?: number;
  total?: number;
  total_pages?: number;
}

export interface PaginatedApiResponse<TItem> extends ApiResponse<{ reviews: TItem[]; aggregate?: unknown }> {
  meta: ResponseMeta & { page: number; size: number; total: number; total_pages: number };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    trace_id: string;
  };
}
