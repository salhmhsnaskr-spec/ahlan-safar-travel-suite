import { describe, expect, it } from "vitest";
import { cleanDetails, fieldsFor } from "@/lib/transaction";

describe("existing service type field mapping", () => {
  it.each([
    ["flight", "from", "airport"],
    ["visa", "country", "from"],
    ["airport_pickup", "airport", "country"],
    ["medical", "hospital", "airport"],
  ])("resolves %s and rejects unrelated stored details", (code, expected, unrelated) => {
    const fields = fieldsFor({ code });
    expect(fields.some((field) => field.key === expected)).toBe(true);
    expect(cleanDetails(fields, { [expected]: "test", [unrelated]: "old service" }))
      .toEqual({ [expected]: "test" });
  });

  it("custom services get generic description fields only", () => {
    expect(fieldsFor({ code: "custom" }).map((f) => f.key)).toEqual(["service_description", "service_location", "requested_date", "quantity", "reminder_days"]);
  });
});
describe("security approval and visit visa", () => {
  it("security approval has the agreed fields and approval statuses", () => {
    const f = fieldsFor({ code: "security_approval" });
    expect(f.map((x) => x.key)).toEqual(["country", "ref_number", "submitted_date", "authority", "approval_status", "decision_date", "linked_request_id", "reminder_days"]);
    expect(f.find((x) => x.key === "approval_status")?.options).toEqual(["جديد", "قيد الإجراء", "موافَق عليه", "مرفوض", "ملغى"]);
  });
  it("visit visa reuses visa fields without a visa-type choice", () => {
    const keys = fieldsFor({ code: "visit_visa" }).map((x) => x.key);
    expect(keys).toContain("country");
    expect(keys).not.toContain("visa_type");
  });
});
