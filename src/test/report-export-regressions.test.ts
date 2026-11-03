import { expect, it } from "vitest";
import { worksheetNames } from "@/lib/excel";
import { buildSheet, filterOffices, overviewSheet, reportContext, type OfficeOverview, type ReportSource } from "@/lib/reports";

const source = (): ReportSource => ({ office: { id: "o", name: "تجريبي", is_partner: false }, customers: [], requests: [], bookings: [], services: [], members: [], activity: [], trips: [], participants: [], partners: [] });

it("matches attribution by both entity and record, excluding another office and failed events", () => {
  const s = source();
  const event = { id: "a", office_id: "o", entity_id: "same", actor_id: null, action: "updated", summary: null, old_values: null, new_values: null, changed_fields: null, result: "success", created_at: "2026-11-01", entity: "requests", actor_name: "منفذ الطلب" };
  s.activity = [event, { ...event, id: "b", entity: "bookings", actor_name: "منفذ الحجز", created_at: "2026-11-02" }, { ...event, id: "c", office_id: "other", actor_name: "مكتب آخر", created_at: "2026-11-03" }, { ...event, id: "d", result: "failed", actor_name: "فشل", created_at: "2026-11-04" }];
  expect(reportContext(s).lastActor("requests", "same")).toBe("منفذ الطلب");
  expect(reportContext(s).lastActor("bookings", "same")).toBe("منفذ الحجز");
});

it("exports the same offices and totals selected by combined filters", () => {
  const base: OfficeOverview = { id: "1", name: "أهلًا", city: "ADEN", country: null, is_partner: true, customers: 3, requests: 2, transactions: 1, bookings: 1, admins: 1, employees: 1, last_activity_at: "2026-11-01", created_at: "2026-10-01" };
  const filtered = filterOffices([base, { ...base, id: "2", is_partner: false, customers: 100 }, { ...base, id: "3", last_activity_at: null }], { search: " aden ", kind: "partner", state: "active" }, Date.parse("2026-11-03"));
  expect(filtered.map((o) => o.id)).toEqual(["1"]);
  expect(overviewSheet(filtered).totals).toContainEqual(["إجمالي العملاء", 3]);
});

it("creates valid unique worksheet names including summary and truncated-name collisions", () => {
  const prefix = "أ".repeat(40);
  const names = worksheetNames(["الملخص", prefix + "1", prefix + "2", "A/B", "a b", ""]);
  expect(names).toEqual(["الملخص (2)", "أ".repeat(31), "أ".repeat(27) + " (2)", "A B", "a b (2)", "تقرير"]);
});

it("exports service fields separately and ignores hidden unrelated values", () => {
  const s = source();
  s.services = [{ id: "visa", office_id: null, code: "visa", name: "تأشيرة", description: null, icon: null, is_active: true, sort_order: 0, created_at: "2026-11-01" }];
  s.requests = [{ id: "r", office_id: "o", number: 1, customer_id: "c", service_id: "visa", assigned_to: null, created_by: null, updated_by: null, completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null, created_at: "2026-11-01", updated_at: "2026-11-01", details: null, service_details: { visa_type: "دراسة", university: "جامعة تجريبية", employer: "قيمة قديمة" }, source: "direct", referring_partner_id: null, service_date: null, priority: "normal", status: "new", notes: null, booking_ref: null, booked_at: null }];
  const sheet = buildSheet("requests", s, {});
  expect(sheet.rows[0]?.[sheet.columns.findIndex((c) => c.header === "الجامعة / المعهد")]).toBe("جامعة تجريبية");
  expect(sheet.rows[0]).not.toContain("قيمة قديمة");
});

it("Umrah bookings are not counted as flight requests", () => {
  const s = source();
  s.services = [{ id: "umrah", office_id: null, code: "umrah", name: "عمرة", description: null, icon: null, is_active: true, sort_order: 0, created_at: "2026-11-01" }];
  s.bookings = [{ id: "b", number: 1, office_id: "o", customer_id: "c", service_id: "umrah", request_id: null, assigned_employee_id: null, service_date: null, status: "confirmed", external_ref: null, provider: null, notes: null, created_by: null, updated_by: null, completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null, created_at: "2026-11-01", updated_at: "2026-11-01" }];
  expect(buildSheet("bookings", s, {}).rows).toHaveLength(1);
  expect(buildSheet("flights", s, {}).rows).toHaveLength(0);
});