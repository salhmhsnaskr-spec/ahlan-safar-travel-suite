import { describe, expect, it } from "vitest";
import { remainingStay, stayClosed } from "@/lib/umrah";
import { deriveAllNotifications, derivePassportNotifications, deriveTaskNotifications, type Customer, type Task } from "@/lib/domain";
import { isAllowedDocument, isPreviewable } from "@/lib/files";
import { pickOffice } from "@/lib/office-choice";

const cust = (id: string, extra: Partial<Customer> = {}) => ({ id, full_name: "TEST " + id, ...extra }) as Customer;
const task = (id: string, due: string | null, status: Task["status"] = "new") =>
  ({ id, title: "TEST " + id, status, due_at: due, assigned_to: "u1", customer_id: "c1", request_id: null }) as Task;

describe("umrah stay end", () => {
  it("uses the 90th day when no visa expiry is recorded", () => {
    expect(remainingStay("2026-01-01", null, "2026-03-26", 5)).toMatchObject({ remaining: 5, lastDay: "2026-03-31", byVisa: false, level: "warning" });
  });
  it("uses an earlier visa expiry as the last allowed day", () => {
    expect(remainingStay("2026-01-01", null, "2026-01-10", 5, "2026-01-15")).toMatchObject({ remaining: 5, lastDay: "2026-01-15", byVisa: true, level: "warning" });
  });
  it("ignores a visa expiry later than the 90th day", () => {
    expect(remainingStay("2026-01-01", null, "2026-03-26", 5, "2026-06-01")).toMatchObject({ lastDay: "2026-03-31", byVisa: false });
  });
  it("closes the counter for cancelled and departed pilgrims", () => {
    expect(stayClosed("cancelled")).toBe(true);
    expect(stayClosed("departed")).toBe(true);
    expect(stayClosed("arrived")).toBe(false);
  });
});

describe("task and passport alerts", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  it("alerts on overdue and due-within-a-day open tasks with the assignee", () => {
    const out = deriveTaskNotifications(
      [task("late", "2026-11-12T09:00:00Z"), task("soon", "2026-11-14T06:00:00Z"), task("later", "2026-11-16T06:00:00Z"), task("done", "2026-11-01T00:00:00Z", "done")],
      [cust("c1")], [{ user_id: "u1", role: "employee", full_name: "سارة", email: null }], now);
    expect(out.map((n) => n.taskId)).toEqual(["late", "soon"]);
    expect(out[0]!.title).toContain("متأخرة");
    expect(out[0]!.body).toContain("سارة");
  });
  it("alerts on passports expiring within 30 days", () => {
    const out = derivePassportNotifications([cust("in", { passport_expiry: "2026-12-10" }), cust("out", { passport_expiry: "2026-12-20" }), cust("none")], "2026-11-13");
    expect(out.map((n) => n.customerId)).toEqual(["in"]);
  });
  it("includes tasks in the combined count used by the menu badge", () => {
    expect(deriveAllNotifications([], [cust("c1")], [], "2026-11-13", { tasks: [task("late", "2026-11-12T09:00:00Z")], now })).toHaveLength(1);
  });
});

describe("document files", () => {
  it("allows office document types and rejects programs", () => {
    expect(isAllowedDocument("passport.PDF")).toBe(true);
    expect(isAllowedDocument("photo.jpeg")).toBe(true);
    expect(isAllowedDocument("setup.exe")).toBe(false);
    expect(isAllowedDocument("noextension")).toBe(false);
  });
  it("previews PDFs and images but downloads Word files", () => {
    expect(isPreviewable("a.pdf")).toBe(true);
    expect(isPreviewable("a.docx")).toBe(false);
  });
});

describe("office choice", () => {
  const offices = [{ id: "a", role: "admin" as const, name: "A" }, { id: "b", role: "employee" as const, name: "B" }];
  it("honours a remembered office only when the user is a member", () => {
    expect(pickOffice(offices, "u", "b")!.id).toBe("b");
    expect(pickOffice(offices, "u", "x")!.id).toBe("a");
    expect(pickOffice([], "u", "a")).toBeUndefined();
  });
});
