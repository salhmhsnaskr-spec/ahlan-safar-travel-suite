import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, FileSpreadsheet, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Loading, NativeSelect, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/domain";
import { OwnerOfficeDelete } from "@/components/office-delete";
import { isActive, overviewSheet, type OfficeOverview } from "@/lib/reports";
import { downloadWorkbook } from "@/lib/excel";
import { printSheets } from "@/components/report-center";

export type PlatformStats = {
  offices: number; active_offices_30d: number; customers: number;
  requests_total: number; requests_cancelled: number; bookings_total: number; bookings_cancelled: number;
  monthly: { month: string; offices: number; customers: number; requests: number; bookings: number }[];
};
export type OwnerOffice = OfficeOverview & { logo_path: string | null; phone: string | null; whatsapp: string | null; email: string | null; logo_url?: string | null };

export async function signedLogos(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return new Map<string, string>();
  const r = await supabase.storage.from("office-logos").createSignedUrls(list, 3600);
  return new Map((r.data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl]));
}

/** Owner check and every number come from security-definer database functions that refuse non-owners. */
export function OwnerDashboard() {
  const q = useQuery({
    queryKey: ["owner-dashboard"],
    queryFn: async () => {
      const own = await supabase.rpc("is_platform_owner");
      if (own.error) throw new Error(own.error.message);
      if (!own.data) return null;
      const [stats, offices] = await Promise.all([supabase.rpc("platform_stats"), supabase.rpc("owner_offices_overview")]);
      if (stats.error) throw new Error(stats.error.message);
      if (offices.error) throw new Error(offices.error.message);
      const list = offices.data as unknown as OwnerOffice[];
      const logos = await signedLogos(list.map((o) => o.logo_path));
      return { stats: stats.data as unknown as PlatformStats, offices: list.map((o) => ({ ...o, logo_url: o.logo_path ? logos.get(o.logo_path) ?? null : null })) };
    },
  });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const offices = useMemo(() => (q.data?.offices ?? []).filter((o) =>
    (!search.trim() || o.name.toLowerCase().includes(search.trim().toLowerCase()) || (o.city ?? "").includes(search.trim()))
    && (!kind || (kind === "partner") === o.is_partner)
    && (!state || (state === "active") === isActive(o.last_activity_at))), [q.data, search, kind, state]);

  if (q.isError) return <div dir="rtl" className="mx-auto max-w-6xl p-4"><EmptyState title="تعذّر تحميل لوحة المالك" body={q.error.message} action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>} /></div>;
  if (q.isLoading) return <Loading />;
  if (!q.data) return <EmptyState title="غير مصرح" body="هذه الصفحة خاصة بمالك المنصة." action={<Link to="/app" className="text-primary">العودة إلى لوحة المكتب</Link>} />;
  const s = q.data.stats;
  const cards: [string, number, string?][] = [
    ["المكاتب المسجلة", s.offices], ["المكاتب النشطة", s.active_offices_30d, "نشاط خلال آخر 30 يومًا"], ["العملاء", s.customers],
    ["الطلبات", s.requests_total, `منها ${s.requests_cancelled} ملغاة`], ["الحجوزات", s.bookings_total, `منها ${s.bookings_cancelled} ملغاة`],
  ];
  const sheet = () => overviewSheet(offices);
  const meta = { officeName: "جميع المكاتب", period: "حتى تاريخ الاستخراج", title: "مقارنة المكاتب" };
  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-4">
      <PageHeader title="لوحة مالك المنصة" subtitle="أرقام فعلية من قاعدة البيانات لكل مكتب" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, n, hint]) => (
          <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{n}</p>{hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}</div>
        ))}
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">المكاتب ({offices.length})</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadWorkbook([sheet()], meta).catch((e: Error) => toast.error(e.message))}><FileSpreadsheet /> مقارنة Excel</Button>
          <Button size="sm" variant="outline" onClick={() => printSheets([sheet()], meta)}><Printer /> طباعة / PDF</Button>
        </div>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_160px_160px]">
        <div className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" placeholder="ابحث باسم المكتب أو المدينة" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <NativeSelect aria-label="نوع المكتب" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">كل الأنواع</option><option value="partner">شريك</option><option value="regular">غير شريك</option></NativeSelect>
        <NativeSelect aria-label="حالة المكتب" value={state} onChange={(e) => setState(e.target.value)}><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option></NativeSelect>
      </div>
      {offices.length === 0 ? <EmptyState title="لا توجد مكاتب مطابقة" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {offices.map((o) => (
            <div key={o.id} className="rounded-xl border bg-card p-4">
              <Link to="/owner/offices/$id" params={{ id: o.id }} className="flex items-start gap-3">
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                  {o.logo_url ? <img src={o.logo_url} alt="" className="size-full object-contain" /> : <Building2 className="size-5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold hover:text-primary">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={o.is_partner ? "text-primary" : ""}>{o.is_partner ? "شريك" : "غير شريك"}</span> · {[o.city, o.country].filter(Boolean).join("، ") || "—"} ·{" "}
                    <span className={isActive(o.last_activity_at) ? "text-success" : ""}>{isActive(o.last_activity_at) ? "نشط" : "غير نشط"}</span>
                  </p>
                </div>
              </Link>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                {([["العملاء", o.customers], ["الطلبات", o.requests], ["معاملات", o.transactions], ["الحجوزات", o.bookings], ["مديرون", o.admins], ["موظفون", o.employees]] as const).map(([l, n]) => (
                  <div key={l} className="rounded-md bg-muted/50 p-1.5"><dt className="text-muted-foreground">{l}</dt><dd className="text-base font-bold">{n}</dd></div>
                ))}
              </dl>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>آخر نشاط: {o.last_activity_at ? formatDateTime(o.last_activity_at) : "لا يوجد"} · سُجّل {formatDate(o.created_at)}</span>
                {import.meta.env["VITE_LOCAL_PERMANENT_DELETION"] === "1" && <OwnerOfficeDelete id={o.id} name={o.name} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-8 font-semibold">الإحصاءات الشهرية (آخر 6 أشهر)</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 text-start">الشهر</th><th className="p-2">مكاتب</th><th className="p-2">عملاء</th><th className="p-2">طلبات</th><th className="p-2">حجوزات</th></tr></thead>
          <tbody>{s.monthly.map((m) => (
            <tr key={m.month} className="border-t text-center"><td className="p-2 text-start" dir="ltr">{m.month}</td><td className="p-2">{m.offices}</td><td className="p-2">{m.customers}</td><td className="p-2">{m.requests}</td><td className="p-2">{m.bookings}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
