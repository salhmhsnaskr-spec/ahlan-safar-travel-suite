import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DataProvider } from "@/lib/data/context";
import { createDemoApi, resetDemoData } from "@/lib/data/demo";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({ meta: [{ title: "النسخة التجريبية — أهلًا سفر" }, { name: "description", content: "جرّب نظام أهلًا سفر مباشرة بدون تسجيل." }, { property: "og:title", content: "النسخة التجريبية — أهلًا سفر" }, { property: "og:description", content: "جرّب نظام أهلًا سفر مباشرة بدون تسجيل." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DemoLayout,
});

function DemoLayout() {
  const api = useMemo(() => createDemoApi(), []);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <DataProvider api={api}>
      <AppShell footer={<button onClick={() => { resetDemoData(); qc.invalidateQueries({ queryKey: ["demo"] }); navigate({ to: "/demo" }); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"><RotateCcw className="size-4" /> إعادة البيانات التجريبية</button>}>
        <Outlet />
      </AppShell>
    </DataProvider>
  );
}
