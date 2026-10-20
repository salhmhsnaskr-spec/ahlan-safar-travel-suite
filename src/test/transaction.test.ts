import { describe, expect, it } from "vitest";
import { cleanDetails, deriveServiceDate, fieldsFor, findDuplicateCustomer } from "@/lib/transaction";
import type { Customer } from "@/lib/domain";

const c = (o: Partial<Customer>) => ({ id: "x", full_name: "أحمد", phone: null, email: null, passport_number: null, ...o }) as Customer;

describe("new transaction rules", () => {
  it("detects a duplicate customer by phone regardless of formatting", () => {
    expect(findDuplicateCustomer([c({ phone: "+966 55 123 4567" })], { phone: "0551234567" })?.id).toBe("x");
  });
  it("detects a duplicate by email or passport, case-insensitive", () => {
    expect(findDuplicateCustomer([c({ email: "A@B.com" })], { email: "a@b.com " })).toBeDefined();
    expect(findDuplicateCustomer([c({ passport_number: "ab123" })], { passport_number: "AB123" })).toBeDefined();
  });
  it("does not flag a different customer", () => {
    expect(findDuplicateCustomer([c({ phone: "0551234567" })], { phone: "0559999999" })).toBeUndefined();
  });
  it("shows flight-specific fields and keeps only filled values", () => {
    const f = fieldsFor({ code: "flight" });
    expect(f.map((x) => x.key)).toContain("depart_date");
    expect(cleanDetails(f, { from: "عدن", to: " ", bogus: "1" })).toEqual({ from: "عدن" });
    expect(deriveServiceDate(f, { depart_date: "2026-11-02" })).toBe("2026-11-02");
  });
});
