export const REVIEW_LIMITS = {
  ratingMin: 1, ratingMax: 5, commentMaxLength: 5000, replyMaxLength: 2000,
  mediaMaxCount: 6, imageMaxSizeBytes: 10 * 1024 * 1024, editWindowDays: 30,
  defaultPageSize: 20, maxPageSize: 100,
} as const;
