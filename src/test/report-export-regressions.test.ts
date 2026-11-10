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

const request = (id: string, service: string, date = "2026-11-01"): ReportSource["requests"][number] => ({ id, office_id: "o", number: 1, customer_id: "c", service_id: service, assigned_to: "u", created_by: "u", updated_by: null, completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null, created_at: date, updated_at: date, details: null, service_details: {}, source: "direct", referring_partner_id: null, service_date: null, priority: "normal", status: "new", notes: null, booking_ref: null, booked_at: null });

it("Umrah transaction service/status and registration period filter rows and distinct trip totals together", () => {
  const s = source();
  s.requests = [request("r1", "umrah"), { ...request("r2", "umrah"), status: "completed" }, request("r3", "flight")];
  s.trips = ["t1", "t2", "empty"].map((id) => ({ id, office_id: "o", name: id, status: "planned", planned_start: null, planned_end: null, notes: null, created_by: "u", created_at: "2026-11-01", updated_at: "2026-11-01" }));
  s.participants = [
    ["p1", "t1", "r1", "2026-11-01"], ["p2", "t1", "r1", "2026-11-02"],
    ["p3", "t2", "r2", "2026-11-01"], ["p4", "t2", "r3", "2026-11-01"], ["p5", "t2", "r1", "2026-10-01"],
  ].map(([id = "", trip_id = "", request_id = "", created_at = ""]) => ({ id, trip_id, request_id, created_at, office_id: "o", customer_id: "c", status: "registered", planned_entry: null, planned_exit: null, actual_entry: null, actual_exit: null, notes: null, reminder_days: null, updated_at: created_at }));
  const sheet = buildSheet("umrah", s, { serviceId: "umrah", status: "new", from: "2026-11-01", to: "2026-11-02" });
  expect(sheet.rows).toHaveLength(2);
  expect(sheet.totals).toContainEqual(["عدد الرحلات", 1]);
});

it("staff pending work respects period, service and transaction status", () => {
  const s = source();
  s.members = [{ user_id: "u", full_name: "موظف", email: null, role: "employee" }];
  s.requests = [request("in", "visa"), request("old", "visa", "2026-10-01"), request("other", "flight"), { ...request("done", "visa"), status: "completed", completed_by: "u", completed_at: "2026-11-01" }];
  const sheet = buildSheet("staff", s, { serviceId: "visa", status: "new", from: "2026-11-01" });
  const row = sheet.rows[0];
  expect(row?.[sheet.columns.findIndex((c) => c.header === "طلبات مفتوحة مسندة")]).toBe(1);
  expect(row?.[sheet.columns.findIndex((c) => c.header === "طلبات أنشأها")]).toBe(1);
  expect(row?.[sheet.columns.findIndex((c) => c.header === "إنجازات")]).toBe(0);
});