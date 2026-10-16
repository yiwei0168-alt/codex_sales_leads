export const retryableModeFailureReasons = [
  'http-429', 'http-500', 'http-502', 'http-503', 'http-504',
  'connection-failed', 'timeout-first-output', 'timeout-total',
] as const;

export function isRetryableModeReceipt(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const receipt = data as { retryable?: unknown; reason?: unknown };
  return receipt.retryable === true && typeof receipt.reason === 'string'
    && retryableModeFailureReasons.some(reason => reason === receipt.reason);
}
