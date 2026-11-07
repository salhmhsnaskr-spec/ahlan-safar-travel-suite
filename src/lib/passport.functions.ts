import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { passportInputSchema, validatePassportImage } from "./passport";

export const extractPassport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(passportInputSchema)
  .handler(async ({ data, context }) => {
    // Verify the requested office AND record before any paid inference.
    const member = await context.supabase.rpc("is_office_member", { _office: data.officeId });
    if (member.error || member.data !== true) throw new Error("لا تملك صلاحية الوصول إلى هذا المكتب.");
    const customer = await context.supabase.from("customers").select("id")
      .eq("id", data.customerId).eq("office_id", data.officeId).maybeSingle();
    if (customer.error || !customer.data) throw new Error("المعتمر غير متاح داخل هذا المكتب.");
    const permission = await context.supabase.rpc("work_allowed", {
      _office: data.officeId, _entity: "customers", _id: data.customerId, _op: "edit",
    });
    if (permission.error || permission.data !== true) throw new Error("تحتاج إذن تعديل بيانات هذا المعتمر.");
    validatePassportImage(data.image);
    const { readPassportImage } = await import("./passport.server");
    return readPassportImage(data.image);
  });