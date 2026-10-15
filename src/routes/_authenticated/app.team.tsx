import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useData, useMembers } from "@/lib/data/context";
import { Field, NativeSelect, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({ meta: [{ title: "الفريق — أهلًا سفر" }, { name: "description", content: "إدارة موظفي المكتب وصلاحياتهم." }, { property: "og:title", content: "الفريق — أهلًا سفر" }, { property: "og:description", content: "إدارة الفريق." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Team,
});

function Team() {
  const { office } = Route.useRouteContext();
  const api = useData();
  const members = useMembers().data ?? [];
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const refresh = () => qc.invalidateQueries({ queryKey: [api.key, "members"] });
  if (api.role !== "admin") return <p className="text-muted-foreground">هذه الصفحة للمدير فقط.</p>;
  return (
    <>
      <PageHeader title="الفريق والصلاحيات" subtitle="المدير يملك كل الصلاحيات، والموظف يدير العملاء والطلبات والحجوزات والخدمات." />
      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end" onSubmit={async (e): Promise<void> => {
        e.preventDefault();
        const { data, error } = await supabase.rpc("add_office_member", { _office: office.id, _email: email, _role: role });
        if (error) { toast.error(error.message); return; }
        if (data === "not_found") { toast.error("لا يوجد حساب بهذا البريد. اطلب من الموظف إنشاء حساب أولًا."); return; }
        toast.success("تمت إضافة العضو"); setEmail(""); refresh();
      }}>
        <Field label="بريد الموظف"><Input required type="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="الدور"><NativeSelect value={role} onChange={(e) => setRole(e.target.value as "admin" | "employee")}><option value="employee">موظف</option><option value="admin">مدير</option></NativeSelect></Field>
        <Button type="submit">إضافة</Button>
      </form>
      <ul className="divide-y rounded-xl border bg-card">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div><p className="font-medium">{m.full_name || "—"}</p><p className="text-xs text-muted-foreground" dir="ltr">{m.email}</p></div>
            <div className="flex items-center gap-2">
              <NativeSelect className="h-8 w-28 text-xs" value={m.role} onChange={async (e) => {
                const { error } = await supabase.from("office_members").update({ role: e.target.value as "admin" | "employee" }).eq("office_id", office.id).eq("user_id", m.user_id);
                if (error) toast.error(error.message); else refresh();
              }}><option value="employee">موظف</option><option value="admin">مدير</option></NativeSelect>
              <Button size="sm" variant="ghost" className="text-danger" onClick={async () => {
                const { error } = await supabase.from("office_members").delete().eq("office_id", office.id).eq("user_id", m.user_id);
                if (error) toast.error(error.message); else refresh();
              }}>إزالة</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
