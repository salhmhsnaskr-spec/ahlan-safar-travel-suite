import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "إنشاء مكتبك — أهلًا سفر" }, { name: "description", content: "أنشئ مكتب السفر الخاص بك في أهلًا سفر." }, { property: "og:title", content: "إنشاء مكتبك — أهلًا سفر" }, { property: "og:description", content: "أنشئ مكتبك." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Onboarding,
});

function Onboarding() {
  const [f, setF] = useState({ name: "", phone: "", city: "", country: "" });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <form className="space-y-4 rounded-2xl border bg-card p-6 md:p-8" onSubmit={async (e): Promise<void> => {
          e.preventDefault(); setBusy(true);
          const { data: u } = await supabase.auth.getUser();
          if (u.user) await supabase.from("profiles").upsert({ id: u.user.id, email: u.user.email ?? null, full_name: (u.user.user_metadata?.['full_name'] as string) ?? null });
          const { error } = await supabase.rpc("create_office", { _name: f.name, ...(f.phone ? { _phone: f.phone } : {}), ...(f.city ? { _city: f.city } : {}), ...(f.country ? { _country: f.country } : {}) });
          setBusy(false);
          if (error) { toast.error(error.message); return; }
          navigate({ to: "/app", replace: true });
        }}>
          <h1 className="text-2xl font-bold">أنشئ مكتبك</h1>
          <p className="text-sm text-muted-foreground">ستكون مديرًا للمكتب ويمكنك إضافة موظفين لاحقًا. إن كنت موظفًا، افتح رابط الدعوة الذي وصلك من مديرك.</p>
          <Field label="اسم المكتب *"><Input required value={f.name} onChange={set("name")} /></Field>
          <Field label="الهاتف"><Input dir="ltr" className="text-end" value={f.phone} onChange={set("phone")} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="المدينة"><Input value={f.city} onChange={set("city")} /></Field><Field label="الدولة"><Input value={f.country} onChange={set("country")} /></Field></div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>إنشاء المكتب</Button>
        </form>
        <div className="mt-4 space-y-3 rounded-2xl border bg-card p-6 text-sm">
          <p className="font-medium">أنا موظف في مكتب قائم</p>
          <p className="text-muted-foreground">لا تنشئ مكتبًا. اطلب من مديرك إرسال دعوة إلى بريدك من «إدارة الفريق»، ثم افتح رابط الدعوة واضغط «قبول الدعوة». إن كانت عضويتك موقوفة فلن تتمكن من الدخول حتى يعيد المدير تفعيلها.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app", replace: true })}>تحقّق من الانضمام</Button>
            <Button type="button" variant="ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}>تسجيل الخروج</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
