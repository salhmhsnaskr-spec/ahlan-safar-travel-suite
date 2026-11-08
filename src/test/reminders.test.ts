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
