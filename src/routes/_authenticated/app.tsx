import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, SignOutButton } from "@/components/app-shell";
import { DataProvider } from "@/lib/data/context";
import { createCloudApi } from "@/lib/data/cloud";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "لوحة المكتب — أهلًا سفر" }, { name: "description", content: "إدارة مكتب السفر في أهلًا سفر." }, { property: "og:title", content: "لوحة المكتب — أهلًا سفر" }, { property: "og:description", content: "إدارة مكتب السفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: async ({ context }) => {
    const user = context.user;
    await supabase.from("profiles").upsert({ id: user.id, email: user.email ?? null, full_name: (user.user_metadata?.['full_name'] as string) ?? (user.user_metadata?.['name'] as string) ?? null });
    const { data } = await supabase.from("office_members").select("office_id, role, offices(name)").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1);
    const m = data?.[0];
    if (!m) throw redirect({ to: "/onboarding" });
    return { office: { userId: user.id, id: m.office_id, role: m.role, name: (m.offices as { name: string } | null)?.name ?? "مكتبي" } };
  },
  component: AppLayout,
});

function AppLayout() {
  const { office } = Route.useRouteContext();
  const api = useMemo(() => createCloudApi(office.id, office.name, office.role, office.userId), [office.id, office.name, office.role, office.userId]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <DataProvider api={api}>
      <AppShell footer={<SignOutButton onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }} />}>
        <Outlet />
      </AppShell>
    </DataProvider>
  );
}
