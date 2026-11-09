import { describe, expect, it } from "vitest";
import { remainingStay } from "@/lib/umrah";
import { reminderDays, fieldsFor } from "@/lib/transaction";

describe("advance reminders", () => {
  it("Umrah warns when 5 days remain of 90, not 6", () => {
    // entry 2026-01-01 → day 90 = 2026-03-31
    expect(remainingStay("2026-01-01", null, "2026-03-26")?.level).toBe("warning"); // 5 left
    expect(remainingStay("2026-01-01", null, "2026-03-25")?.level).toBe("ok"); // 6 left
  });
  it("reminder defaults to 5 days and accepts a user value", () => {
    expect(reminderDays({})).toBe(5);
    expect(reminderDays({ reminder_days: "10" })).toBe(10);
    expect(reminderDays({ reminder_days: "abc" })).toBe(5);
  });
  it("every service form offers the reminder field", () => {
    for (const code of ["umrah", "flight", "visa", "hotel", "anything"]) expect(fieldsFor({ code }).some((f) => f.key === "reminder_days")).toBe(true);
  });
});

import { deriveAllNotifications } from "@/lib/domain";

describe("alert targets", () => {
  const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const customers = [{ id: "c1", full_name: "معتمر أ" }, { id: "c2", full_name: "عميل ب" }] as never[];
  const req = (id: string, days: number, details: Record<string, string> = {}) =>
    ({ id, number: 7, customer_id: "c2", status: "in_progress", service_date: iso(days), service_details: details, created_at: iso(0), updated_at: iso(0) }) as never;

  it("a service alert opens its own transaction, using the 5-day default", () => {
    const out = deriveAllNotifications([req("r-in", 4), req("r-out", 6)], customers, [], iso(0));
    expect(out.map((n) => n.requestId)).toEqual(["r-in"]);
  });
  it("a custom reminder of 10 days raises the alert at 8 days", () => {
    expect(deriveAllNotifications([req("r10", 8, { reminder_days: "10" })], customers, [], iso(0))).toHaveLength(1);
  });
  it("a stay alert opens the pilgrim's trip and row; departed pilgrims raise none", () => {
    const base = { customer_id: "c1", actual_entry: iso(-87), actual_exit: null };
    const out = deriveAllNotifications([], customers, [
      { ...base, id: "p1", trip_id: "t1", status: "arrived" },
      { ...base, id: "p2", trip_id: "t1", status: "departed" },
    ], iso(0));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "stay", tripId: "t1", participantId: "p1" });
  });
});
