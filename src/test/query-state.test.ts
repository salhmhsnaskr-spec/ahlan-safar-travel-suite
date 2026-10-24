import { describe, expect, it, vi } from "vitest";
import { readState, retryFailedReads, type ReadQuery } from "@/lib/query-state";

const query = (overrides: Partial<ReadQuery> = {}): ReadQuery => ({
  isPending: false, isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue(undefined), ...overrides,
});

describe("Required read states (isolated, no production access)", () => {
  it("never marks a failed dependency ready, even with other reads pending or cached", () => {
    expect(readState([query(), query({ isError: true }), query({ isPending: true })])).toBe("error");
  });
  it("waits for every required read before deriving empty results or counts", () => {
    expect(readState([query(), query({ isPending: true })])).toBe("loading");
    expect(readState([query(), query()])).toBe("ready");
  });
  it("retries failed reads only, without repeating successful or in-flight requests", async () => {
    const failed = query({ isError: true });
    const good = query();
    const busy = query({ isError: true, isFetching: true });
    await retryFailedReads([failed, good, busy]);
    expect(failed.refetch).toHaveBeenCalledTimes(1);
    expect(good.refetch).not.toHaveBeenCalled();
    expect(busy.refetch).not.toHaveBeenCalled();
  });
  it("keeps a failed retry in error until a successful read is reported", async () => {
    const failed = query({ isError: true, refetch: vi.fn().mockRejectedValue(new Error("offline")) });
    await retryFailedReads([failed]);
    expect(readState([failed])).toBe("error");
    expect(readState([query()])).toBe("ready");
  });
});