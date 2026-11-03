import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ job: { id: "j", remaining: ["o/a.pdf", "o/b.pdf"], status: "storage_pending", attempts: 0 }, exists: new Map<string, unknown>(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: state.job, error: null }) }) }),
      update: (v: unknown) => { state.update(v); return { eq: async () => ({ error: null }) }; },
    }),
    storage: { from: () => ({ remove: state.remove, exists: async (p: string) => state.exists.get(p) }) },
  },
}));
import { processDeletionJob } from "@/lib/data/cloud-deletion.server";

beforeEach(() => { state.update.mockReset(); state.remove.mockReset().mockResolvedValue({ data: [], error: null }); state.exists.clear(); });

it("completes only when Storage confirms every file is gone (404 counts as gone)", async () => {
  state.exists.set("o/a.pdf", { data: false, error: null });
  state.exists.set("o/b.pdf", { data: null, error: { status: 404, message: "not found" } });
  const r = await processDeletionJob("j");
  expect(r).toEqual({ jobId: "j", completed: true, remaining: 0 });
  expect(state.update.mock.calls[0]![0]).toMatchObject({ status: "completed", remaining: [] });
});

it("keeps unconfirmed paths for retry instead of reporting success", async () => {
  state.exists.set("o/a.pdf", { data: true, error: null });
  state.exists.set("o/b.pdf", { data: null, error: { status: 500, message: "storage down" } });
  const r = await processDeletionJob("j");
  expect(r.completed).toBe(false);
  expect(r.remaining).toBe(2);
  expect(state.update.mock.calls[0]![0]).toMatchObject({ status: "storage_failed", remaining: ["o/a.pdf", "o/b.pdf"], attempts: 1 });
});
