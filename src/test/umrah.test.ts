import { describe, expect, it } from "vitest";
import { stayDuration, stayLabel, validateParticipantDates } from "@/lib/umrah";

describe("umrah stay duration (entry and exit days both counted)", () => {
  it("1st to 10th is 10 days, final", () => {
    expect(stayDuration("2026-03-01", "2026-03-10", "2026-04-01")).toEqual({ kind: "final", days: 10 });
  });
  it("same-day entry and exit is 1 day", () => {
    expect(stayDuration("2026-03-01", "2026-03-01", "2026-04-01")).toEqual({ kind: "final", days: 1 });
  });
  it("not yet departed shows days so far, not final", () => {
    const s = stayDuration("2026-03-01", null, "2026-03-05");
    expect(s).toEqual({ kind: "so_far", days: 5 });
    expect(stayLabel(s)).toBe("الأيام حتى الآن: 5");
  });
  it("exit before entry gives no duration", () => {
    expect(stayDuration("2026-03-10", "2026-03-01", "2026-04-01").kind).toBe("none");
  });
  it("missing entry gives no duration", () => {
    expect(stayDuration(null, null, "2026-04-01").kind).toBe("none");
    expect(stayDuration(null, "2026-03-05", "2026-04-01")).toEqual({ kind: "none", reason: "invalid" });
  });
  it("rejects inconsistent dates", () => {
    expect(validateParticipantDates({ actual_exit: "2026-03-05" })).not.toBeNull();
    expect(validateParticipantDates({ actual_entry: "2026-03-05", actual_exit: "2026-03-01" })).not.toBeNull();
    expect(validateParticipantDates({ actual_entry: "2026-03-01", actual_exit: "2026-03-05", planned_entry: "2026-02-01" })).toBeNull();
  });
});
