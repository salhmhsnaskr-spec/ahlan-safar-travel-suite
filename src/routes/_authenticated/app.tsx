import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, SignOutButton } from "@/components/app-shell";
import { DataProvider } from "@/lib/data/context";
import { createCloudApi } from "@/lib/data/cloud";
import { DeletionQuarantine } from '@/lib/data/deletion-quarantine';
import { pickOffice, rememberOffice, type OfficeChoice } from "@/lib/office-choice";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "لوحة المكتب — أهلًا سفر" }, { name: "description", content: "إدارة مكتب السفر في أهلًا سفر." }, { property: "og:title", content: "لوحة المكتب — أهلًا سفر" }, { property: "og:description", content: "إدارة مكتب السفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: async ({ context }) => {
    const user = context.user;
    await supabase.from("profiles").upsert({ id: user.id, email: user.email ?? null, full_name: (user.user_metadata?.['full_name'] as string) ?? (user.user_metadata?.['name'] as string) ?? null });
    const { data } = await supabase.from("office_members").select("office_id, role, offices(name)").eq("user_id", user.id).eq("status", "active").order("created_at");
    const offices: OfficeChoice[] = (data ?? []).map((m) => ({ id: m.office_id, role: m.role, name: (m.offices as { name: string } | null)?.name ?? "مكتبي" }));
    const m = pickOffice(offices, user.id);
    if (!m) throw redirect({ to: "/onboarding" });
    return { office: { userId: user.id, id: m.id, role: m.role, name: m.name }, offices };
  },
  component: AppLayout,
});

function OfficeSwitcher({ offices, current, userId }: { offices: OfficeChoice[]; current: string; userId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  if (offices.length < 2) return null;
  return (
    <label className="block rounded-lg border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground">
      <span className="mb-1 flex items-center gap-1.5 font-medium"><Building2 className="size-3.5" /> المكتب الحالي</span>
      <select aria-label="اختيار المكتب" value={current} className="w-full rounded-md border border-sidebar-border bg-sidebar px-2 py-1.5 text-sm text-sidebar-accent-foreground"
        onChange={async (e) => {
          rememberOffice(userId, e.target.value);
          await qc.cancelQueries(); qc.clear();
          await router.invalidate();
          navigate({ to: "/app" });
        }}>
        {offices.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.role === "admin" ? "مدير" : "موظف"}</option>)}
      </select>
    </label>
  );
}

function AppLayout() {
  const { office, offices } = Route.useRouteContext();
  const api = useMemo(() => createCloudApi(office.id, office.name, office.role, office.userId), [office.id, office.name, office.role, office.userId]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <DataProvider api={api}>
      <AppShell footer={<div className="space-y-2"><OfficeSwitcher offices={offices} current={office.id} userId={office.userId} /><SignOutButton onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }} /></div>}>
        {import.meta.env['VITE_LOCAL_PERMANENT_DELETION']==='1' ? <DeletionQuarantine officeId={office.id}><Outlet /></DeletionQuarantine> : <Outlet />}
      </AppShell>
    </DataProvider>
  );
}
