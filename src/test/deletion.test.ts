import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertCustomerHasNoDependents, assertDocumentDeletion } from "@/lib/data/deletion";
import type { DocumentRow } from "@/lib/domain";

const fake = vi.hoisted(() => ({ from: vi.fn(), storageFrom: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fake.from, storage: { from: fake.storageFrom } } }));
import { createCloudApi } from "@/lib/data/cloud";

const row = { id: "doc", storage_path: "office/file.pdf", uploaded_by: "uploader" };
const input = { ...row, storage_path: "other/forged.pdf", uploaded_by: "employee" } as DocumentRow;
const api = () => createCloudApi("office", "test", "admin", "admin");
let chain: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> };
let remove: ReturnType<typeof vi.fn>;
let list: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  chain = { select: vi.fn(), eq: vi.fn(), delete: vi.fn(), insert: vi.fn(), single: vi.fn(), limit: vi.fn() };
  for (const key of ["select", "eq", "delete"] as const) chain[key].mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: row, error: null });
  chain.insert.mockResolvedValue({ data: null, error: null });
  fake.from.mockReturnValue(chain);
  remove = vi.fn().mockResolvedValue({ data: [], error: null });
  list = vi.fn().mockResolvedValue({ data: [], error: null });
  fake.storageFrom.mockReturnValue({ remove, list });
});

describe("local deletion rules (mock transport, not real Storage/RLS)", () => {
  for (const [index, label] of ["requests", "bookings", "tasks", "documents", "umrah_participants"].entries()) {
    it(`blocks customer deletion with ${label}`, async () => {
      let n = 0;
      chain.limit.mockImplementation(() => Promise.resolve({ data: n++ === index ? [{ id: "child" }] : [], error: null }));
      await expect(api().deleteCustomer("customer")).rejects.toThrow();
      expect(chain.delete).not.toHaveBeenCalled();
    });
  }
  it("accepts no dependents and rejects employee deletion of another uploader's file", () => {
    expect(() => assertCustomerHasNoDependents([[], [], [], [], []])).not.toThrow();
    expect(() => assertDocumentDeletion("employee", "employee", "other")).toThrow();
    expect(() => assertDocumentDeletion("employee", "employee", "employee")).not.toThrow();
    expect(() => assertDocumentDeletion("admin", "admin", "other")).not.toThrow();
  });
  it("fails closed on child read error", async () => {
    chain.limit.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(api().deleteCustomer("customer")).rejects.toThrow("denied");
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it("retains metadata when Storage deletion fails", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(api().deleteDocument(input)).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith(["office/file.pdf"]);
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it("rejects a forged uploader before any Storage call", async () => {
    await expect(createCloudApi("office", "test", "employee", "employee").deleteDocument(input)).rejects.toThrow();
    expect(remove).not.toHaveBeenCalled();
  });
  it("keeps row when removal returns success but object still exists", async () => {
    list.mockResolvedValue({ data: [{ name: "file.pdf" }], error: null });
    await expect(api().deleteDocument(input)).rejects.toThrow();
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it("keeps row when absence verification fails", async () => {
    list.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(api().deleteDocument(input)).rejects.toThrow();
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it("retries row deletion after file removal, without trusting supplied path", async () => {
    chain.select.mockImplementation(() => chain.delete.mock.calls.length ? Promise.resolve({ data: [{ id: "doc" }], error: null }) : chain);
    await api().deleteDocument(input);
    expect(remove).toHaveBeenCalledWith(["office/file.pdf"]);
    expect(chain.delete).toHaveBeenCalledOnce();
    expect(remove.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(chain.delete.mock.invocationCallOrder[0] ?? -Infinity);
  });
  it("reports failed row deletion after confirmed file absence", async () => {
    chain.select.mockImplementation(() => chain.delete.mock.calls.length ? Promise.resolve({ data: [], error: null }) : chain);
    await expect(api().deleteDocument(input)).rejects.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });
  it("does not upload a file when metadata insert fails", async () => {
    chain.insert.mockResolvedValue({ data: null, error: { message: "insert denied" } });
    const file = { name: "test.pdf", size: 1, type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as File;
    await expect(api().uploadDocument(file, {})).rejects.toThrow("insert denied");
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });
});