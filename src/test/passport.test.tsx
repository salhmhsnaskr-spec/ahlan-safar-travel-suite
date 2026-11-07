import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { passportInputSchema, reviewedPassport, validatePassportImage } from "@/lib/passport";
import type { Customer } from "@/lib/domain";

const state = vi.hoisted(() => ({ extract: vi.fn(), save: vi.fn(), mode: "cloud", allowed: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => state.extract }));
vi.mock("@/lib/passport.functions", () => ({ extractPassport: vi.fn() }));
vi.mock("@/lib/data/context", () => ({ useData: () => ({ mode: state.mode, officeId: "office-a" }), useSaveCustomer: () => ({ mutateAsync: state.save, isPending: false }) }));
vi.mock("@/components/work-permission-control", () => ({ useWorkAccess: () => () => state.allowed }));
import { PassportReview } from "@/components/passport-review";

const customer = { id: "c-a", office_id: "office-a", full_name: "اسم قديم" } as Customer;
const imageBytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
beforeEach(() => { state.mode = "cloud"; state.allowed = true; state.save.mockReset().mockResolvedValue(customer); state.extract.mockReset().mockResolvedValue({ full_name: "TEST PILGRIM", passport_number: "TEST123", nationality: "TEST" }); });
afterEach(cleanup);

it("requires explicit human confirmation before constructing a save payload", () => {
  expect(() => reviewedPassport({ full_name: "TEST", passport_number: "123", nationality: "TEST" }, false)).toThrow("أكّد");
  expect(reviewedPassport({ full_name: " TEST ", passport_number: "123 ", nationality: "" }, true)).toEqual({ full_name: "TEST", passport_number: "123", nationality: null });
});
it("rejects remote URLs and forged images rather than fetching them", () => {
  expect(() => validatePassportImage("https://example.com/passport.png")).toThrow();
  expect(() => validatePassportImage("data:image/png;base64," + btoa("not a real image"))).toThrow();
  expect(validatePassportImage("data:image/png;base64," + btoa(String.fromCharCode(...imageBytes)))).toContain("data:image/png");
});
it("requires explicit valid office and customer scope", () => {
  expect(passportInputSchema.safeParse({ officeId: "", customerId: "", image: "x" }).success).toBe(false);
});
it("does not make an extraction available in demo or for another office", () => {
  state.mode = "demo";
  const view = render(<PassportReview customer={customer} onBusy={() => {}} />);
  expect(screen.queryByLabelText("صورة الجواز")).toBeNull();
  state.mode = "cloud"; view.rerender(<PassportReview customer={{ ...customer, office_id: "office-b" }} onBusy={() => {}} />);
  expect(screen.queryByLabelText("صورة الجواز")).toBeNull();
  expect(state.extract).not.toHaveBeenCalled();
});
it("extracts without saving; edits revoke confirmation; explicit confirm saves only reviewed identity fields", async () => {
  render(<PassportReview customer={customer} onBusy={() => {}} />);
  fireEvent.change(screen.getByLabelText("صورة الجواز"), { target: { files: [new File([imageBytes], "test.png", { type: "image/png" })] } });
  await waitFor(() => expect(screen.getByLabelText("الاسم المستخرج")).toHaveValue("TEST PILGRIM"));
  expect(state.save).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "تأكيد وحفظ بيانات الجواز" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("رقم الجواز المستخرج"), { target: { value: "REVIEWED123" } });
  expect(screen.getByRole("button", { name: "تأكيد وحفظ بيانات الجواز" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "تأكيد وحفظ بيانات الجواز" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledWith({ id: "c-a", full_name: "TEST PILGRIM", passport_number: "REVIEWED123", nationality: "TEST" }));
});
it("hides extraction when edit permission is absent", () => {
  state.allowed = false;
  render(<PassportReview customer={customer} onBusy={() => {}} />);
  expect(screen.queryByLabelText("صورة الجواز")).toBeNull();
});