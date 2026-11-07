import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ member: true, customer: true, permission: true, read: vi.fn(), filters: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ middleware: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/passport.server", () => ({ readPassportImage: state.read }));
import { extractPassport } from "@/lib/passport.functions";

const run = () => {
  // Mock builder retains handler rather than RPC transport, exercising authorization itself.
  const handler = extractPassport as unknown as (args: unknown) => Promise<unknown>;
  const chain = { eq: (key: string, value: string) => { state.filters(key, value); return chain; }, maybeSingle: async () => ({ error: null, data: state.customer ? { id: "c" } : null }) };
  return handler({ data: { officeId: "o", customerId: "c", image: "data:image/png;base64,iVBORw0KGgoAAAAA" }, context: { supabase: {
    rpc: async (name: string) => ({ data: name === "is_office_member" ? state.member : state.permission, error: null }),
    from: () => ({ select: () => chain }),
  } } });
};
beforeEach(() => { state.member = true; state.customer = true; state.permission = true; state.read.mockReset().mockResolvedValue({ full_name: "TEST" }); state.filters.mockReset(); });
it("denies nonmembers before AI inference", async () => {
  state.member = false; await expect(run()).rejects.toThrow("المكتب"); expect(state.read).not.toHaveBeenCalled();
});
it("denies a missing or other-office customer before AI inference", async () => {
  state.customer = false; await expect(run()).rejects.toThrow("المعتمر"); expect(state.read).not.toHaveBeenCalled();
  expect(state.filters).toHaveBeenCalledWith("office_id", "o");
});
it("requires record edit permission even for an office member", async () => {
  state.permission = false; await expect(run()).rejects.toThrow("إذن تعديل"); expect(state.read).not.toHaveBeenCalled();
});
it("returns temporary extraction only after scoped authorization", async () => {
  await expect(run()).resolves.toEqual({ full_name: "TEST" }); expect(state.read).toHaveBeenCalledTimes(1);
});