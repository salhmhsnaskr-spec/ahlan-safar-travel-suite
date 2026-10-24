/** Shared read-state policy: failed reads must never masquerade as empty data. */
export type ReadQuery = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

export function readState(queries: readonly ReadQuery[]): "error" | "loading" | "ready" {
  if (queries.some((q) => q.isError)) return "error";
  if (queries.some((q) => q.isPending)) return "loading";
  return "ready";
}

export async function retryFailedReads(queries: readonly ReadQuery[]) {
  await Promise.allSettled(queries.filter((q) => q.isError && !q.isFetching).map((q) => q.refetch()));
}