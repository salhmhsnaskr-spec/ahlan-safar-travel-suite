import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/kit";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة — أهلًا سفر" },
      { name: "description", content: "عيّن كلمة مرور جديدة لحسابك في أهلًا سفر." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — أهلًا سفر" },
      { property: "og:description", content: "عيّن كلمة مرور جديدة لحسابك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center"><Logo /></Link>
        <form
          className="space-y-4 rounded-2xl border bg-card p-6 md:p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { error } = await supabase.auth.updateUser({ password });
            setBusy(false);
            if (error) { toast.error(error.message); return; }
            toast.success("تم تحديث كلمة المرور");
            navigate({ to: "/app", replace: true });
          }}
        >
          <h1 className="text-2xl font-bold">كلمة مرور جديدة</h1>
          <Field label="كلمة المرور الجديدة"><Input required type="password" minLength={6} dir="ltr" className="text-end" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button type="submit" className="h-11 w-full" disabled={busy}>حفظ</Button>
        </form>
      </div>
    </div>
  );
}
