/** Only explicit object absence is success; network/authorization failures stay retryable. */
export function assertStorageAbsent(result: { data: boolean; error: unknown }) {
  if (result.data) throw new Error('Storage object remains');
  if (!result.error) return;
  const error = result.error as { status?: number | string; statusCode?: number | string; message?: string; originalError?: { status?: number } };
  const status = Number(error.status ?? error.statusCode ?? error.originalError?.status);
  const objectMissing = /^(object not found|the resource was not found)\.?$/i.test(error.message?.trim() ?? '');
  if (status === 404 || (status === 400 && objectMissing)) return;
  throw new Error('Storage absence unverified');
}