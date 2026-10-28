import { expect, it } from "vitest";
import { SUPPORT_WHATSAPP_URL } from "@/components/app-shell";

it("support button uses the platform WhatsApp number with no extra data", () => {
  expect(SUPPORT_WHATSAPP_URL).toBe("https://wa.me/967716091944");
});
