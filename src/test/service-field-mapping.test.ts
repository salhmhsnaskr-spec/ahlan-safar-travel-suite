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

  it("does not invent fields for unclassified custom services", () => {
    expect(fieldsFor({ code: "custom" })).toEqual([]);
  });
});