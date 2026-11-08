export interface MediaScanResult {
  isSafe: boolean;
  reason?: string;
  scannerId?: string;
}

/** Port for malware and content policy scanning of uploaded media. */
export interface MediaScannerPort {
  scan(mediaId: string, objectKey: string): Promise<MediaScanResult>;
}

export const MEDIA_SCANNER_PORT = Symbol('MEDIA_SCANNER_PORT');

/** Development-only scanner adapter.
 *  CRITICAL SECURITY INVARIANT: Strictly forbidden in production.
 *  If NODE_ENV === 'production', throws an error rather than silently marking files safe.
 */
export class DevMediaScannerAdapter implements MediaScannerPort {
  async scan(mediaId: string, _objectKey: string): Promise<MediaScanResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevMediaScannerAdapter is strictly prohibited in production. A production scanner provider must be configured.',
      );
    }
    // In local development, simulate successful scan
    return {
      isSafe: true,
      reason: 'DEV_AUTO_APPROVED',
      scannerId: 'dev-noop-scanner',
    };
  }
}
