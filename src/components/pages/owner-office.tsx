import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Field, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ReportCenter, periodLabel } from "@/components/report-center";
import { signedLogos } from "@/components/pages/owner";
import { activityActionLabels } from "@/lib/domain";
import { buildSheet, inPeriod, presetPeriod, type ReportFilters, type ReportKind, type ReportSource } from "@/lib/reports";
import type { Member } from "@/lib/domain";

type Detail = Omit<ReportSource, "office" | "members"> & { office: ReportSource["office"] & Record<string, unknown> & { logo_path: string | null }; members: (Member & { joined_at: string })[] };

const tabs: [ReportKind, string][] = [["customers", "العملاء"], ["requests", "الطلبات"], ["bookings", "الحجوزات"], ["umrah", "العمرة"], ["staff", "الموظفون"], ["activity", "سجل النشاط"]];

export function OwnerOfficeDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["owner-office", id],
    queryFn: async () => {
      const r = await supabase.rpc("owner_office_detail", { _office: id });
      if (r.error) throw new Error(r.error.message);
      const d = r.data as unknown as Detail;
      if (!d.office) return null;
      const logos = await signedLogos([d.office.logo_path]);
      return { ...d, office: { ...d.office, logo_url: d.office.logo_path ? logos.get(d.office.logo_path) ?? null : null } };
    },
  });
  const partner = useMutation({
    mutationFn: async (v: boolean) => { const r = await supabase.rpc("owner_set_office_partner", { _office: id, _is_partner: v }); if (r.error) throw new Error(r.error.message); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner-office", id] }); qc.invalidateQueries({ queryKey: ["owner-dashboard"] }); toast.success("تم تحديث تصنيف المكتب"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [f, setF] = useState<ReportFilters>({});
  const [tab, setTab] = useState<ReportKind>("customers");
  const sheet = useMemo(() => (q.data ? buildSheet(tab, q.data as ReportSource, f) : null), [q.data, tab, f]);

  if (q.isLoading) return <Loading />;
  if (q.isError) return <div dir="rtl" className="p-4"><EmptyState title="تعذّر تحميل المكتب" body={q.error.message} action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>} /></div>;
  if (!q.data || !sheet) return <EmptyState title="المكتب غير موجود" action={<Link to="/owner" className="text-primary">العودة</Link>} />;
  const d = q.data as ReportSource & { office: Detail["office"] };
  const o = d.office as Record<string, string | null> & { is_partner: boolean; name: string; logo_url?: string | null };
  const count = <T extends { created_at: string }>(l: T[]) => l.filter((x) => inPeriod(x.created_at, f)).length;
  const stats: [string, number][] = [
    ["العملاء", count(d.customers)], ["الطلبات", count(d.requests)], ["المعاملات بتفاصيل خدمة", d.requests.filter((r) => inPeriod(r.created_at, f) && r.service_details && Object.keys(r.service_details as object).length > 0).length],
    ["الحجوزات", count(d.bookings)], ["المكتملة", d.requests.filter((r) => r.status === "completed" && inPeriod(r.completed_at, f)).length], ["الإجراءات", count(d.activity)],
    ["المديرون", d.members.filter((m) => m.role === "admin" && (m.status ?? "active") === "active").length], ["الموظفون", d.members.filter((m) => m.role === "employee" && (m.status ?? "active") === "active").length],
  ];
  const set = (k: keyof ReportFilters) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value || undefined }));
  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-4">
      <Link to="/owner" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="size-4" /> جميع المكاتب</Link>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="grid size-16 place-items-center overflow-hidden rounded-xl border bg-muted">{o.logo_url ? <img src={o.logo_url} alt="" className="size-full object-contain" /> : <Building2 className="size-6 text-muted-foreground" />}</div>
        <div className="min-w-0 flex-1"><PageHeader title={o.name} subtitle={[o["city"], o["country"], o["phone"], o["email"]].filter(Boolean).join(" · ") || "لا توجد بيانات تواصل"} /></div>
        <label className="flex items-center gap-2 text-sm">مكتب شريك <Switch checked={o.is_partner} disabled={partner.isPending} onCheckedChange={(v) => partner.mutate(v)} /></label>
      </div>

      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {([["day", "اليوم"], ["week", "الأسبوع"], ["month", "الشهر"], ["year", "السنة"]] as const).map(([p, l]) => <Button key={p} size="sm" variant="outline" onClick={() => setF((s) => ({ ...s, ...presetPeriod(p) }))}>{l}</Button>)}
          <Button size="sm" variant="ghost" onClick={() => setF((s) => ({ ...s, from: undefined, to: undefined }))}>كل الفترات</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="من"><Input type="date" value={f.from ?? ""} onChange={set("from")} /></Field>
          <Field label="إلى"><Input type="date" value={f.to ?? ""} onChange={set("to")} /></Field>
          <Field label="الموظف"><NativeSelect aria-label="الموظف" value={f.employee ?? ""} onChange={set("employee")}><option value="">الكل</option>{d.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect></Field>
          <Field label="نوع النشاط"><NativeSelect aria-label="نوع النشاط" value={f.action ?? ""} onChange={set("action")}><option value="">الكل</option>{Object.entries(activityActionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">الفترة: {periodLabel(f)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {stats.map(([l, n]) => <div key={l} className="rounded-lg bg-muted/50 p-2 text-center"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-xl font-bold">{n}</p></div>)}
        </div>
      </section>

      <div className="mb-2 flex flex-wrap gap-2">{tabs.map(([k, l]) => <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>)}</div>
      <div className="mb-6 max-h-[60vh] overflow-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground"><tr>{sheet.columns.slice(2).map((c) => <th key={c.header} className="whitespace-nowrap p-2 text-start">{c.header}</th>)}</tr></thead>
          <tbody>
            {sheet.rows.length === 0 ? <tr><td className="p-4 text-center text-muted-foreground" colSpan={sheet.columns.length}>لا توجد سجلات في هذه الفترة</td></tr>
              : sheet.rows.slice(0, 300).map((r, i) => <tr key={i} className="border-t">{r.slice(2).map((v, j) => <td key={j} className="whitespace-nowrap p-2" dir={sheet.columns[j + 2]?.kind === "phone" ? "ltr" : undefined}>{v ?? "—"}</td>)}</tr>)}
          </tbody>
        </table>
        {sheet.rows.length > 300 && <p className="p-2 text-xs text-muted-foreground">يُعرض أول 300 سجل؛ التصدير يتضمن جميع السجلات ({sheet.rows.length}).</p>}
      </div>
      <ReportCenter source={d} title={`تقرير ${o.name}`} />
    </div>
  );
}
