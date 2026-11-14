import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertDocumentDeletion } from "@/lib/data/deletion";
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
  it("preserves document deletion authority", () => {
    expect(() => assertDocumentDeletion("employee", "employee", "other")).toThrow();
    expect(() => assertDocumentDeletion("employee", "employee", "employee")).not.toThrow();
    expect(() => assertDocumentDeletion("admin", "admin", "other")).not.toThrow();
  });
  it("does not upload a file when metadata insert fails", async () => {
    chain.insert.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: null, error: { message: "insert denied" } });
    const file = { name: "test.pdf", size: 1, type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as File;
    await expect(api().uploadDocument(file, {})).rejects.toThrow("insert denied");
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });
});