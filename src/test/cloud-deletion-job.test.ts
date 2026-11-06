import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ saveError: null as null | { message: string }, stale: false, refs: [] as { storage_path: string }[], job: { id: "j", office_id: "o", remaining: ["o/a.pdf", "o/b.pdf"], status: "storage_pending", attempts: 0 }, exists: new Map<string, unknown>(), update: vi.fn(), filters: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: state.job, error: null }) }), in: async () => ({ data: state.refs, error: null }) }),
      update: (v: unknown) => {
        state.update(v);
        const chain = { eq: (field: string, value: unknown) => { state.filters(field, value); return chain; }, select: () => ({ maybeSingle: async () => ({ data: state.stale ? null : { id: 'j' }, error: state.saveError }) }) };
        return chain;
      },
    }),
    storage: { from: () => ({ remove: state.remove, exists: async (p: string) => state.exists.get(p) }) },
  },
}));
import { processDeletionJob } from "@/lib/data/cloud-deletion.server";

beforeEach(() => { state.saveError = null; state.stale = false; state.refs = []; state.job = { id: 'j', office_id: 'o', remaining: ['o/a.pdf', 'o/b.pdf'], status: 'storage_pending', attempts: 0 }; state.filters.mockReset(); state.update.mockReset(); state.remove.mockReset().mockResolvedValue({ data: [], error: null }); state.exists.clear(); });

it("completes only when Storage confirms every file is gone (404 counts as gone)", async () => {
  state.exists.set("o/a.pdf", { data: false, error: null });
  state.exists.set("o/b.pdf", { data: null, error: { status: 404, message: "not found" } });
  const r = await processDeletionJob("j");
  expect(r).toEqual({ jobId: "j", completed: true, remaining: 0 });
  expect(state.update.mock.calls[0]?.[0]).toMatchObject({ status: "completed", remaining: [] });
});

it("keeps unconfirmed paths for retry instead of reporting success", async () => {
  state.exists.set("o/a.pdf", { data: true, error: null });
  state.exists.set("o/b.pdf", { data: null, error: { status: 500, message: "storage down" } });
  const r = await processDeletionJob("j");
  expect(r.completed).toBe(false);
  expect(r.remaining).toBe(2);
  expect(state.update.mock.calls[0]?.[0]).toMatchObject({ status: "storage_failed", remaining: ["o/a.pdf", "o/b.pdf"], attempts: 1 });
});

it("does not accept generic 400 errors or malformed absence responses", async () => {
  state.exists.set("o/a.pdf", { data: false, error: { status: 400, message: "Bad request" } });
  state.exists.set("o/b.pdf", { data: null, error: null });
  expect(await processDeletionJob("j")).toEqual({ jobId: "j", completed: false, remaining: 2 });
});

it("does not announce completion when saving the result fails", async () => {
  state.exists.set("o/a.pdf", { data: false, error: null });
  state.exists.set("o/b.pdf", { data: false, error: null });
  state.saveError = { message: "database unavailable" };
  await expect(processDeletionJob("j")).rejects.toThrow("تعذّر حفظ نتيجة الحذف");
});

it('rejects another-office paths before Storage calls', async () => {
  state.job.remaining = ['other-office/file'];
  await expect(processDeletionJob('j')).rejects.toThrow('لا تطابق المكتب');
  expect(state.remove).not.toHaveBeenCalled();
});

it('completed jobs do not repeat file removal or rewrite completion', async () => {
  state.job.status = 'completed';
  expect(await processDeletionJob('j')).toEqual({ jobId: 'j', completed: true, remaining: 0 });
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.update).not.toHaveBeenCalled();
});

it('processes at most 100 paths and retains the remainder durably', async () => {
  state.job.remaining = Array.from({ length: 101 }, (_, i) => `o/${i}`);
  state.job.remaining.forEach(path => state.exists.set(path, { data: false, error: null }));
  expect(await processDeletionJob('j')).toEqual({ jobId: 'j', completed: false, remaining: 1 });
  expect(state.remove.mock.calls[0]?.[0]).toHaveLength(100);
  expect(state.update.mock.calls[0]?.[0]).toMatchObject({ remaining: ['o/100'], status: 'storage_failed' });
});

it('stale processors cannot overwrite a newer result or report success', async () => {
  state.exists.set('o/a.pdf', { data: false, error: null });
  state.exists.set('o/b.pdf', { data: false, error: null });
  state.stale = true;
  await expect(processDeletionJob('j')).rejects.toThrow('محاولة أحدث');
  expect(state.filters).toHaveBeenCalledWith('attempts', 0);
  expect(state.filters).toHaveBeenCalledWith('status', 'storage_pending');
});

it('still-referenced objects are never removed and stay pending', async () => {
  state.refs = [{ storage_path: 'o/a.pdf' }];
  state.exists.set('o/b.pdf', { data: false, error: null });
  expect(await processDeletionJob('j')).toEqual({ jobId: 'j', completed: false, remaining: 1 });
  expect(state.remove).toHaveBeenCalledWith(['o/b.pdf']);
  expect(state.update.mock.calls[0]?.[0]).toMatchObject({ remaining: ['o/a.pdf'] });
});
