import { expect, it } from "vitest";
import { fieldsFor, missingRequired, visibleFields, cleanDetails } from "@/lib/transaction";
import { buildSheet, inPeriod, isActive, type ReportSource } from "@/lib/reports";

it("visa fields change with the visa type and hide unrelated fields", () => {
  const f = fieldsFor({ code: "visa" });
  const study = visibleFields(f, { visa_type: "دراسة" }).map((x) => x.key);
  expect(study).toContain("university");
  expect(study).not.toContain("employer");
  expect(visibleFields(f, { visa_type: "عمل" }).map((x) => x.key)).toContain("employer");
  expect(cleanDetails(f, { visa_type: "عمل", university: "x", employer: "شركة" })).toEqual({ visa_type: "عمل", employer: "شركة" });
});

it("required fields are reported only when visible", () => {
  const f = fieldsFor({ code: "flight" });
  expect(missingRequired(f, { passenger_name: "a", trip_type: "ذهاب فقط", from: "عدن", to: "جدة", depart_date: "2026-11-10" })).toEqual([]);
  expect(missingRequired(f, { passenger_name: "a", trip_type: "ذهاب وعودة", from: "عدن", to: "جدة", depart_date: "2026-11-10" })).toEqual(["تاريخ العودة"]);
});

it("unknown service codes fall back to generic custom fields", () => {
  expect(fieldsFor({ code: "something-new" }).map((x) => x.key)).toContain("service_description");
});

const src = (): ReportSource => ({
  office: { id: "o", name: "مكتب", is_partner: true },
  customers: [{ id: "c1", office_id: "o", full_name: "أحمد", phone: "00967712345678", email: null, passport_number: null, passport_expiry: null, nationality: null, notes: "مهم", source: "direct", referring_partner_id: null, assigned_to: "u2", created_by: null, updated_by: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-02T10:00:00Z" }],
  requests: [], bookings: [], services: [], trips: [], participants: [], partners: [],
  members: [{ user_id: "u2", role: "employee", full_name: "سارة", email: null }],
  activity: [{ id: "a", office_id: "o", actor_id: "u2", actor_name: "سارة", entity: "customers", entity_id: "c1", action: "updated", summary: null, created_at: "2026-11-02T10:00:00Z", old_values: null, new_values: null, result: "success", changed_fields: null }],
});

it("customer report keeps the phone with leading zeros and never guesses an unknown creator", () => {
  const s = buildSheet("customers", src(), {});
  const row = s.rows[0]!;
  const col = (h: string) => row[s.columns.findIndex((c) => c.header === h)];
  expect(col("رقم الهاتف")).toBe("00967712345678");
  expect(s.columns.find((c) => c.header === "رقم الهاتف")?.kind).toBe("phone");
  expect(col("أنشأه")).toBe("—");
  expect(col("المسؤول الحالي")).toBe("سارة");
  expect(col("منفذ آخر إجراء")).toBe("سارة");
  expect(col("تصنيف المكتب")).toBe("شريك");
});

it("period filter is inclusive and office activity window is 30 days", () => {
  expect(inPeriod("2026-11-01T23:00:00Z", { from: "2026-11-01", to: "2026-11-01" })).toBe(true);
  expect(inPeriod("2026-10-31T23:00:00Z", { from: "2026-11-01" })).toBe(false);
  expect(isActive("2026-10-05T00:00:00Z", Date.parse("2026-11-03T00:00:00Z"))).toBe(true);
  expect(isActive("2026-10-01T00:00:00Z", Date.parse("2026-11-03T00:00:00Z"))).toBe(false);
});
